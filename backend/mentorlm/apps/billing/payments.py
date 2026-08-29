"""Деньги: оформление подписки, автосписания, возвраты — вся логика здесь.

Views, планировщик и админка только зовут функции этого модуля; ни одно место
проекта не собирает запрос к ЮKassa самостоятельно. Причина та же, по которой
`apps/ai/service.py` — единственная точка входа в генерацию: правил вокруг
платежа много, они юридические, и продублировать их «почти правильно» во втором
месте — вопрос времени.

Ключевые инварианты, которые модуль обязан удерживать:

* **Строка `Payment` создаётся ДО обращения к ЮKassa.** Иначе сбой между
  запросом и ответом оставляет списанные деньги без следа в нашей базе.
* **Повтор запроса идёт с тем же `Idempotence-Key`** — он лежит в строке
  платежа, а не генерируется на месте (см. `yookassa.py`).
* **Автосписание невозможно без отправленного за 24 часа уведомления.**
  Это не проверка «на всякий случай», а единственная реализация п. 7.3 оферты
  и ст. 16.1 ЗоЗПП: списание без уведомления обязывает вернуть всю сумму
  (п. 7.6), поэтому запрет стоит в коде, а не в инструкции для разработчика.
* **`apply_succeeded` идемпотентен.** Уведомление вебхука и опрос статуса со
  страницы возврата приходят наперегонки и оба зовут его; период должен
  продлиться один раз.
"""

from __future__ import annotations

import logging
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, NamedTuple

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.mailer.sender import send_async
from apps.usage.models import UsageEvent

from .limits import (
    PLAN_PRICE_RUB,
    RECEIPT_MEASURE,
    RECEIPT_PAYMENT_MODE,
    RECEIPT_PAYMENT_SUBJECT,
    RECEIPT_TAX_SYSTEM_CODE,
    RECEIPT_VAT_CODE,
    RENEWAL_MAX_ATTEMPTS,
    RENEWAL_NOTICE_HOURS,
    USD_RUB_RATE,
    USE_KKT_RECEIPTS,
    add_billing_month,
    limits_for,
    plan_price,
)
from .models import BillingEvent, Payment, Plan, Refund, Subscription, log_event
from .plans import active_subscription
from .yookassa import YooKassaError, create_payment, create_refund, get_payment

logger = logging.getLogger(__name__)

# $1 = 1_000_000 µ$ — тот же множитель, что в limits._MICRO; здесь он нужен для
# обратного перевода себестоимости в рубли при расчёте возврата.
_MICRO = Decimal("1000000")


class PaymentError(Exception):
    """Платёж не может быть создан по нашим правилам, а не по вине ЮKassa."""

    def __init__(self, message: str, *, code: str = "payment_failed") -> None:
        super().__init__(message)
        self.code = code


# ── Вспомогательное ───────────────────────────────────────────────────────────


def _money(value) -> str:
    """Сумма в формате ЮKassa: строка с ровно двумя знаками после точки."""
    return str(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _plan_label(plan: str) -> str:
    """Человеческое имя тарифа («Plus»), как его видит пользователь."""
    return limits_for(plan)["label"]


def _return_url(payment: Payment) -> str:
    """Куда ЮKassa вернёт человека с платёжной формы.

    Адрес обязан быть абсолютным (требование документации). Ведёт на фронт, а
    не на API: страница /billing/return опрашивает статус и не зависит от того,
    успел ли дойти вебхук.
    """
    base = settings.YOOKASSA_RETURN_URL or f"{settings.PUBLIC_SITE_URL}/billing/return"
    return f"{base}?payment={payment.pk}"


def manage_url() -> str:
    """Прямая ссылка на управление подпиской в ЛК.

    Нужна письмам: закон требует не просто упомянуть возможность отказа, а
    указать способ. Ссылка на главную таким способом не является, поэтому
    `?settings=subscription` открывает диалог настроек сразу на нужной вкладке
    (обрабатывается в app/(modes)/layout.tsx).
    """
    return f"{settings.PUBLIC_SITE_URL}/chat?settings=subscription"


def billing_url() -> str:
    """Страница тарифов — куда звать, когда подписки уже нет."""
    return f"{settings.PUBLIC_SITE_URL}/billing"


def _receipt(payment: Payment) -> dict[str, Any] | None:
    """Данные чека для ЮKassa — или None, если чеки идут не через кассу.

    ⚠️ Исполнитель — ИП на НПД, а плательщики НПД освобождены от применения
    ККТ (п. 2.2 ст. 2 ФЗ-54). Модуль чеков ЮKassa целиком построен вокруг
    онлайн-кассы, поэтому при `TAX_MODE = "npd"` блок receipt не отправляется
    вовсе: при неподключённой кассе провайдер такой запрос отклонит.

    Чек при этом всё равно обязателен — но другой, по ФЗ-422, из «Мой налог».
    Его выдача отслеживается полями `Payment.npd_receipt_*`.
    """
    if not USE_KKT_RECEIPTS:
        return None
    receipt: dict[str, Any] = {
        "customer": {"email": payment.user_email},
        "items": [
            {
                "description": f"Подписка Mentor LM {_plan_label(payment.plan)}, 1 месяц"[:128],
                "quantity": "1.00",
                "amount": {"value": _money(payment.amount), "currency": payment.currency},
                "vat_code": RECEIPT_VAT_CODE,
                "payment_mode": RECEIPT_PAYMENT_MODE,
                "payment_subject": RECEIPT_PAYMENT_SUBJECT,
                "measure": RECEIPT_MEASURE,
            }
        ],
    }
    # Только если задана явно: у магазина с одной системой налогообложения
    # лишнее значение — повод для отказа, а не уточнение.
    if RECEIPT_TAX_SYSTEM_CODE is not None:
        receipt["tax_system_code"] = RECEIPT_TAX_SYSTEM_CODE
    return receipt


class SavedMethod(NamedTuple):
    """Что мы узнали о платёжном средстве из ответа ЮKassa.

    `id` пуст ⇔ привязки не произошло. Это ровно тот признак, который
    документация («Привязка во время платежа») велит проверять: сохранение
    подтверждается флагом `payment_method.saved`, а не тем, что мы попросили
    `save_payment_method`. Попросить можно всегда, а сохраниться — нет:
    человек мог заплатить способом без поддержки привязки, отказаться на
    форме или наткнуться на сбой.
    """

    id: str
    type: str
    last4: str
    card_type: str


def _method_from(obj: dict) -> SavedMethod:
    """Разобрать `payment_method` из ответа ЮKassa.

    Больше ничего из объекта платежа мы не сохраняем: политика
    конфиденциальности перечисляет хранимые платёжные данные исчерпывающе.

    Тип способа берём всегда, а идентификатор — только при `saved: true`.
    Записать id непривязанного способа значило бы получить подписку, с которой
    планировщик будет пытаться списать несписываемое.
    """
    method = obj.get("payment_method") or {}
    card = method.get("card") or {}
    saved = bool(method.get("saved"))
    return SavedMethod(
        id=str(method.get("id", "")) if saved else "",
        type=str(method.get("type", ""))[:32],
        last4=str(card.get("last4", ""))[:4],
        card_type=str(card.get("card_type", ""))[:32],
    )


# ── Оформление подписки ───────────────────────────────────────────────────────


def start_checkout(user, plan: str, *, auto_renew: bool, ip: str | None = None) -> Payment:
    """Создать платёж за тариф и вернуть строку с `confirmation_url`.

    Сценарий «Умный платёж»: мы не касаемся реквизитов карты вовсе — человек
    уходит на форму ЮKassa и возвращается уже с результатом.

    `auto_renew` — это и есть согласие на автосписания. Если его нет,
    `save_payment_method` не отправляется вообще: платёж разовый, привязки не
    возникает, и списать что-либо потом технически нечем.
    """
    if plan not in (Plan.PLUS, Plan.PRO):
        raise PaymentError("Этот тариф нельзя оплатить", code="invalid_plan")

    price = plan_price(plan)
    if price <= 0:
        raise PaymentError("Для тарифа не задана цена", code="invalid_plan")

    current = active_subscription(user)
    if current and current.plan == plan and current.status == Subscription.Status.ACTIVE:
        raise PaymentError("Этот тариф уже подключён", code="already_subscribed")

    # Смена тарифа отличается от первой покупки только пометкой: по принятому
    # правилу оплачивается полная цена и период начинается заново, поэтому
    # сумма и срок считаются одинаково.
    kind = Payment.Kind.UPGRADE if current else Payment.Kind.INITIAL

    payment = Payment.objects.create(
        user=user,
        user_email=user.email,
        subscription=current,
        plan=plan,
        kind=kind,
        amount=Decimal(price),
        description=f"Mentor LM {_plan_label(plan)} — подписка на 1 месяц"[:128],
        # Согласие фиксируется вместе с платежом: подписка появится только
        # после оплаты, а согласие относится к моменту нажатия кнопки.
        auto_renew_requested=auto_renew,
        consent_ip=ip or None,
    )

    payload: dict[str, Any] = {
        "amount": {"value": _money(payment.amount), "currency": payment.currency},
        "capture": True,
        "confirmation": {
            "type": "redirect",
            "return_url": _return_url(payment),
            "locale": "ru_RU",
        },
        "description": payment.description,
        # Связывает платёж в кабинете ЮKassa с покупателем — пригодится при
        # разборе обращений в поддержку.
        "merchant_customer_id": user.email,
        "metadata": {
            "payment_id": str(payment.pk),
            "user_id": str(user.pk),
            "plan": plan,
            "kind": kind,
        },
    }
    # Блок чека уходит только при подключённой кассе; на НПД его нет (см. _receipt).
    receipt = _receipt(payment)
    if receipt is not None:
        payload["receipt"] = receipt
    if auto_renew:
        # Только при явном согласии. Отсутствие ключа = карта не привязывается.
        payload["save_payment_method"] = True
        # И сразу открываем форму ввода карты вместо общего экрана выбора.
        # Привязать у нас можно только банковскую карту, поэтому предупреждать
        # «выберите карту, иначе автопродления не будет» бессмысленно: человек
        # прочитает это на нашей странице, а решение примет на чужой, где СБП
        # стоит первым как самый быстрый. Проще не создавать ситуацию, чем
        # объяснять её. Это предвыбор, а не запрет — сменить способ на форме
        # ЮKassa по-прежнему можно, и на этот случай остаётся вся страховка:
        # `saved: false` не включит автопродление (см. _activate_subscription).
        payload["payment_method_data"] = {"type": "bank_card"}

    try:
        obj = create_payment(payload, idempotence_key=str(payment.idempotence_key))
    except YooKassaError as exc:
        payment.status = Payment.Status.CANCELED
        payment.cancellation_reason = "provider_error"
        payment.save(update_fields=["status", "cancellation_reason", "updated_at"])

        # Различаем «провайдер лежит» и «провайдер отверг запрос». Второе —
        # почти всегда ошибка настройки магазина (например, включён модуль
        # чеков, а мы на НПД их не шлём: «Receipt is missing or illegal»), и
        # советовать «попробуйте через минуту» в этом случае — врать: повтор
        # не поможет ни через минуту, ни через день.
        if exc.retryable:
            logger.error("Не удалось создать платёж %s: %s", payment.pk, exc)
            raise PaymentError(
                "Платёжный сервис временно недоступен. Попробуйте через минуту.",
                code="provider_unavailable",
            ) from exc

        logger.error(
            "ЮKassa ОТВЕРГЛА платёж %s: %s. Это ошибка настройки, повтор не "
            "поможет — проверьте настройки магазина и dev_docs/notes/paymentsNote.md",
            payment.pk,
            exc,
        )
        raise PaymentError(
            "Не удалось создать платёж. Мы уже разбираемся — напишите нам, "
            "если это повторится.",
            code="provider_rejected",
        ) from exc

    payment.external_id = obj.get("id") or None
    payment.status = obj.get("status", Payment.Status.PENDING)
    payment.confirmation_url = (obj.get("confirmation") or {}).get("confirmation_url", "")
    payment.save(
        update_fields=["external_id", "status", "confirmation_url", "updated_at"]
    )

    if auto_renew:
        log_event(
            kind=BillingEvent.Kind.CONSENT_GIVEN,
            user=user,
            subscription=current,
            note=f"Согласие на автосписания при оплате тарифа {_plan_label(plan)}",
            ip=ip,
        )
    return payment


# ── Автосписание ──────────────────────────────────────────────────────────────


def renewal_blocked_reason(sub: Subscription) -> str:
    """Почему с этой подписки нельзя списать сейчас; пустая строка — можно.

    Здесь собраны все условия из раздела 7 оферты, и это единственное место,
    где они проверяются. Функция вынесена отдельно от `charge_renewal`, чтобы
    планировщик мог показать причину в логе, не пытаясь провести платёж.
    """
    if not sub.auto_renew:
        return "автопродление отключено"
    if sub.canceled_at:
        return "пользователь отказался от продления"
    if not sub.payment_method_id:
        return "нет привязанного платёжного средства"
    if sub.status == Subscription.Status.CANCELED:
        return "подписка отменена"
    if not sub.current_period_end:
        return "не задан конец периода"
    if sub.renewal_attempts >= RENEWAL_MAX_ATTEMPTS:
        return f"исчерпаны попытки списания ({RENEWAL_MAX_ATTEMPTS})"

    # Незавершённое списание по этой подписке. Автоплатёж может задержаться в
    # `pending` (документация ЮKassa: платёж ждёт онлайн-кассу), а планировщик
    # ходит каждые 10 минут — без этой проверки он создал бы второй платёж,
    # пока первый ещё в пути, и человек заплатил бы дважды за один месяц.
    if (
        Payment.objects.filter(
            subscription=sub,
            kind=Payment.Kind.RENEWAL,
            status__in=(Payment.Status.PENDING, Payment.Status.WAITING_FOR_CAPTURE),
        )
        .exclude(external_id=None)
        .exists()
    ):
        return "предыдущее списание ещё выполняется"

    # Главное условие: уведомление за 24 часа (п. 7.3). Списание без него
    # обязывает вернуть всю сумму (п. 7.6), поэтому просто не списываем.
    if not sub.renewal_notified_at:
        return "не отправлено уведомление о списании"
    notice_age = sub.current_period_end - sub.renewal_notified_at
    if notice_age.total_seconds() < RENEWAL_NOTICE_HOURS * 3600:
        return (
            f"уведомление отправлено менее чем за {RENEWAL_NOTICE_HOURS} ч "
            "до списания"
        )
    return ""


def charge_renewal(sub: Subscription) -> Payment:
    """Списать оплату следующего периода с привязанной карты.

    Автоплатёж отличается от обычного отсутствием `confirmation`: подтверждать
    его пользователю не нужно и негде. Чек прикладывается такой же — оферта
    обещает его на каждое списание, а не только на первое.
    """
    blocked = renewal_blocked_reason(sub)
    if blocked:
        raise PaymentError(f"Списание невозможно: {blocked}", code="renewal_blocked")

    user = sub.user
    if user is None:
        raise PaymentError("Подписка без пользователя", code="renewal_blocked")

    price = plan_price(sub.plan)
    payment = Payment.objects.create(
        user=user,
        user_email=user.email,
        subscription=sub,
        plan=sub.plan,
        kind=Payment.Kind.RENEWAL,
        amount=Decimal(price),
        description=f"Mentor LM {_plan_label(sub.plan)} — продление подписки"[:128],
        # Продление происходит по согласию, данному ранее: переносим его на
        # платёж, чтобы активация не приняла продление за разовую оплату.
        auto_renew_requested=True,
        consent_ip=sub.auto_renew_consent_ip,
    )

    payload: dict[str, Any] = {
        "amount": {"value": _money(payment.amount), "currency": payment.currency},
        "capture": True,
        "payment_method_id": sub.payment_method_id,
        "description": payment.description,
        "metadata": {
            "payment_id": str(payment.pk),
            "user_id": str(user.pk),
            "plan": sub.plan,
            "kind": Payment.Kind.RENEWAL,
        },
    }
    receipt = _receipt(payment)
    if receipt is not None:
        payload["receipt"] = receipt

    try:
        obj = create_payment(payload, idempotence_key=str(payment.idempotence_key))
    except YooKassaError as exc:
        payment.status = Payment.Status.CANCELED
        payment.cancellation_reason = "provider_error"
        payment.save(update_fields=["status", "cancellation_reason", "updated_at"])
        _register_failed_renewal(sub, reason=str(exc))
        raise PaymentError(str(exc), code="provider_unavailable") from exc

    payment.external_id = obj.get("id") or None
    payment.save(update_fields=["external_id", "updated_at"])

    # Обычно ответ уже несёт финальный статус, но не обязан: документация
    # («Проведение автоплатежа») прямо допускает `pending` — платёж ждёт
    # ответа онлайн-кассы. Дожать его — работа `_sync_stale` в планировщике.
    apply_provider_state(payment, obj)
    payment.refresh_from_db()

    # Провалом считаем ТОЛЬКО отказ. Считать провалом «ещё не завершён» значит
    # разослать письмо «не удалось списать» по платежу, который через минуту
    # пройдёт, и заодно приблизить подписку к отмене по счётчику попыток.
    if payment.status == Payment.Status.CANCELED:
        _register_failed_renewal(sub, reason=payment.cancellation_reason or "отклонён")
    elif payment.status != Payment.Status.SUCCEEDED:
        logger.info(
            "Подписка %s: автоплатёж %s в статусе %r — ждём подтверждения",
            sub.pk,
            payment.pk,
            payment.status,
        )
    return payment


def _register_failed_renewal(sub: Subscription, *, reason: str) -> None:
    """Неудачное списание: грейс, письмо, а после исчерпания попыток — Free."""
    sub.renewal_attempts += 1
    sub.status = Subscription.Status.PAST_DUE
    fields = ["renewal_attempts", "status", "updated_at"]

    exhausted = sub.renewal_attempts >= RENEWAL_MAX_ATTEMPTS
    if exhausted:
        # П. 7.8: списание не проходит — подписка не продлевается, дальше Free.
        sub.status = Subscription.Status.CANCELED
        sub.auto_renew = False
        # И согласие тоже: автопродление здесь работало, просто карта не
        # потянула. Оставить «запрошено» — значит показать в ЛК объяснение
        # «привязка не удалась», которого не было.
        sub.auto_renew_requested = False
        sub.canceled_at = timezone.now()
        sub.cancel_reason = "Не удалось списать оплату"
        fields += ["auto_renew", "auto_renew_requested", "canceled_at", "cancel_reason"]

    sub.save(update_fields=fields)
    log_event(
        kind=BillingEvent.Kind.CHARGE_FAILED,
        user=sub.user,
        subscription=sub,
        note=f"Попытка {sub.renewal_attempts}: {reason}"[:255],
    )

    if sub.user:
        send_async(
            sub.user.email,
            "renewal_failed",
            {
                "plan_label": _plan_label(sub.plan),
                "amount": plan_price(sub.plan),
                "access_until": format_date(sub.current_period_end),
                "exhausted": exhausted,
                "attempts_left": max(0, RENEWAL_MAX_ATTEMPTS - sub.renewal_attempts),
                "billing_url": billing_url() if exhausted else manage_url(),
            },
        )


# ── Применение статуса платежа ────────────────────────────────────────────────


def apply_provider_state(payment: Payment, obj: dict) -> Payment:
    """Привести локальный платёж в соответствие с состоянием у провайдера.

    Единственная дверь, через которую состояние ЮKassa попадает к нам: и вебхук,
    и опрос со страницы возврата, и досинхронизация в планировщике зовут её.
    """
    status = obj.get("status", "")
    if status == "succeeded":
        return _apply_succeeded(payment, obj)
    if status == "canceled":
        return _apply_canceled(payment, obj)

    # pending / waiting_for_capture — платёж ещё в пути, просто фиксируем.
    if status and payment.status != status:
        payment.status = status
        payment.save(update_fields=["status", "updated_at"])
    return payment


def _apply_succeeded(payment: Payment, obj: dict) -> Payment:
    """Зачесть успешный платёж: включить или продлить подписку.

    Идемпотентна: блокирует строку платежа и выходит, если он уже зачтён.
    Вебхук и опрос статуса регулярно приходят одновременно — без этого период
    продлился бы дважды за одну оплату.
    """
    with transaction.atomic():
        locked = Payment.objects.select_for_update().get(pk=payment.pk)
        if locked.status == Payment.Status.SUCCEEDED:
            return locked

        method = _method_from(obj)
        locked.status = Payment.Status.SUCCEEDED
        locked.paid_at = timezone.now()
        locked.payment_method_id = method.id
        locked.payment_method_type = method.type
        locked.card_last4 = method.last4
        locked.card_type = method.card_type

        sub = _activate_subscription(locked, method=method)
        locked.subscription = sub
        locked.period_start = sub.current_period_start
        locked.period_end = sub.current_period_end
        locked.save()

    log_event(
        kind=BillingEvent.Kind.CHARGED,
        user=locked.user,
        subscription=locked.subscription,
        note=f"{locked.amount} ₽ — {locked.get_kind_display()}",
    )

    send_async(
        locked.user_email,
        "payment_succeeded",
        {
            "plan_label": _plan_label(locked.plan),
            "amount": int(locked.amount),
            "period_end": format_date(locked.period_end),
            "auto_renew": bool(locked.subscription and locked.subscription.auto_renew),
            "email": locked.user_email,
            # От режима зависит текст про чек: при кассе его пришлёт ОФД сам,
            # на НПД — мы вручную, отдельным письмом. Обещать не то, что
            # произойдёт, нельзя: человек пойдёт искать чек не туда.
            "kkt_receipt": USE_KKT_RECEIPTS,
        },
    )
    return locked


def issue_npd_receipt(payment: Payment, url: str, *, by: str = "system") -> Payment:
    """Отметить, что по платежу выдан чек «Мой налог», и отправить его покупателю.

    Чек формируется вручную в приложении (автоматизировать нельзя без
    партнёрского доступа к API ФНС), сюда попадает только его постоянная ссылка.
    Отправка письма — это и есть «передача чека покупателю» из ч. 1 ст. 14
    ФЗ-422, поэтому отметка ставится вместе с письмом, а не отдельно.
    """
    payment.npd_receipt_url = url.strip()[:500]
    payment.npd_receipt_at = timezone.now()
    payment.save(update_fields=["npd_receipt_url", "npd_receipt_at", "updated_at"])

    send_async(
        payment.user_email,
        "npd_receipt",
        {
            "plan_label": _plan_label(payment.plan),
            "amount": int(payment.amount),
            "receipt_url": payment.npd_receipt_url,
            "paid_at": format_date(payment.paid_at),
        },
    )
    logger.info("Чек НПД по платежу %s выдан (%s)", payment.pk, by)
    return payment


def payments_awaiting_npd_receipt():
    """Оплаченные платежи, по которым чек ещё не выдан, — от старых к новым.

    Порядок не случайный: у старых платежей срок по ФЗ-422 истекает раньше.
    """
    if USE_KKT_RECEIPTS:
        return Payment.objects.none()
    return Payment.objects.filter(
        status=Payment.Status.SUCCEEDED,
        npd_receipt_at__isnull=True,
    ).order_by("paid_at")


def _activate_subscription(payment: Payment, *, method: SavedMethod) -> Subscription:
    """Включить оплаченный тариф. Вызывается только внутри транзакции.

    Продление своего же тарифа сдвигает конец периода; покупка другого тарифа
    закрывает старую подписку и открывает новую с сегодняшнего дня — принятое
    правило смены тарифа (полная цена, период заново).

    Здесь же держится главный инвариант автопродления: `auto_renew` включается
    только там, где есть чем списать. Согласие пользователя — необходимое
    условие, но не достаточное.
    """
    now = timezone.now()
    user = payment.user
    sub = (
        Subscription.objects.select_for_update()
        .filter(user=user, plan=payment.plan)
        .exclude(status=Subscription.Status.CANCELED)
        .order_by("-created_at")
        .first()
        if user
        else None
    )

    if sub is None:
        # Другие активные подписки закрываем: действует ровно одна.
        if user:
            Subscription.objects.filter(user=user).exclude(
                status=Subscription.Status.CANCELED
            ).update(
                status=Subscription.Status.CANCELED,
                auto_renew=False,
                canceled_at=now,
                cancel_reason="Смена тарифа",
                updated_at=now,
            )
        sub = Subscription(user=user, plan=payment.plan)
        sub.current_period_start = now
        sub.current_period_end = add_billing_month(now)
    else:
        # Продление: считаем от конца оплаченного периода, если он ещё не
        # прошёл, — иначе человек терял бы уже оплаченные дни.
        base = (
            sub.current_period_end
            if sub.current_period_end and sub.current_period_end > now
            else now
        )
        sub.current_period_start = sub.current_period_start or now
        sub.current_period_end = add_billing_month(base)

    sub.status = Subscription.Status.ACTIVE
    sub.provider = "yookassa"
    sub.renewal_attempts = 0
    # Уведомления относились к прошедшему циклу — под следующий сбрасываем оба.
    sub.renewal_notified_at = None
    sub.expiry_notified_at = None
    sub.offer_version = settings.OFFER_VERSION

    if method.id:
        sub.payment_method_id = method.id
        sub.payment_method_type = method.type
        sub.card_last4 = method.last4
        sub.card_type = method.card_type

    # Согласие берём из строки платежа, где оно зафиксировано при нажатии
    # кнопки, — это юридический факт, и он сохраняется независимо от того,
    # удалась ли привязка.
    sub.auto_renew_requested = payment.auto_renew_requested

    # А вот включить автопродление можно, только если есть чем списывать.
    # `sub.payment_method_id` в условии — не лишний: апгрейд, оплаченный
    # способом без привязки, не должен сносить карту, привязанную раньше.
    can_charge = bool(sub.payment_method_id)
    auto_renew = payment.auto_renew_requested and can_charge

    if auto_renew:
        if not sub.auto_renew:
            sub.auto_renew = True
            sub.auto_renew_consent_at = now
            sub.auto_renew_consent_ip = payment.consent_ip
        # Оплатили заново после отказа — отказ больше не действует.
        sub.canceled_at = None
        sub.cancel_reason = ""
    else:
        # Два разных случая, и оба ведут сюда:
        #
        # 1. Согласие есть, привязки нет. Молчаливое `auto_renew = True` было
        #    бы обещанием, которого планировщик физически не выполнит:
        #    подписка погасла бы без предупреждения.
        # 2. Галочку не ставили. Экран оформления обещает буквально:
        #    «автоматических списаний не будет» — значит их и не должно быть,
        #    даже если карта осталась привязанной с прошлой покупки. Гасим
        #    ранее выданное согласие: продолжать списывать после такого экрана
        #    значило бы списывать без выраженного согласия (ст. 16 ЗоЗПП).
        was_on = sub.auto_renew
        sub.auto_renew = False
        if was_on and not payment.auto_renew_requested:
            log_event(
                kind=BillingEvent.Kind.AUTORENEW_OFF,
                user=payment.user,
                subscription=sub,
                note="Оплата оформлена без автопродления — согласие снято",
            )

    sub.save()

    if payment.auto_renew_requested and not auto_renew:
        logger.info(
            "Платёж %s: автопродление запрошено, но привязка не удалась "
            "(способ %r) — подписка %s останется без автосписаний",
            payment.pk,
            method.type or "неизвестен",
            sub.pk,
        )
        log_event(
            kind=BillingEvent.Kind.CONSENT_GIVEN,
            user=payment.user,
            subscription=sub,
            note=(
                "Согласие на автосписания дано, но платёжное средство не "
                f"привязано (способ оплаты: {method.type or 'неизвестен'})"
            )[:255],
        )

    return sub


def _apply_canceled(payment: Payment, obj: dict) -> Payment:
    """Зафиксировать отклонённый платёж. Подписку не трогает."""
    details = obj.get("cancellation_details") or {}
    payment.status = Payment.Status.CANCELED
    payment.cancellation_reason = str(details.get("reason", ""))[:100]
    payment.save(update_fields=["status", "cancellation_reason", "updated_at"])
    return payment


def sync_payment(payment: Payment) -> Payment:
    """Перечитать состояние платежа у ЮKassa и применить его.

    Нужен там, где ждать вебхук нельзя или незачем: страница возврата
    опрашивает статус сразу, планировщик добивает зависшие платежи.
    """
    if not payment.external_id:
        return payment
    try:
        obj = get_payment(payment.external_id)
    except YooKassaError as exc:
        logger.warning("Не удалось перечитать платёж %s: %s", payment.pk, exc)
        return payment
    return apply_provider_state(payment, obj)


# ── Управление автопродлением ─────────────────────────────────────────────────


def cancel_autorenew(sub: Subscription, *, reason: str = "", ip: str | None = None) -> Subscription:
    """Отказ от автопродления (п. 7.4 оферты).

    Отказ принимается без объяснения причин и фиксируется — отсюда запись в
    журнал. Доступ к оплаченному тарифу сохраняется до конца периода (п. 7.7),
    поэтому статус подписки не меняется: истечёт сам.
    """
    now = timezone.now()
    sub.auto_renew = False
    # Снимаем и само пожелание: человек передумал, и ЛК не должен продолжать
    # объяснять, почему «запрошенное» автопродление не работает.
    sub.auto_renew_requested = False
    sub.canceled_at = now
    sub.cancel_reason = (reason or "Отказ пользователя в личном кабинете")[:255]
    sub.save(
        update_fields=[
            "auto_renew",
            "auto_renew_requested",
            "canceled_at",
            "cancel_reason",
            "updated_at",
        ]
    )

    log_event(
        kind=BillingEvent.Kind.AUTORENEW_OFF,
        user=sub.user,
        subscription=sub,
        note=sub.cancel_reason,
        ip=ip,
    )
    if sub.user:
        send_async(
            sub.user.email,
            "subscription_canceled",
            {
                "plan_label": _plan_label(sub.plan),
                "access_until": format_date(sub.current_period_end),
                "manage_url": manage_url(),
            },
        )
    return sub


def enable_autorenew(sub: Subscription, *, ip: str | None = None) -> Subscription:
    """Включить автопродление обратно — нужна сохранённая карта."""
    if not sub.payment_method_id:
        raise PaymentError(
            "Нет привязанного платёжного средства — оформите подписку заново",
            code="no_payment_method",
        )
    now = timezone.now()
    sub.auto_renew = True
    sub.auto_renew_requested = True
    sub.canceled_at = None
    sub.cancel_reason = ""
    sub.auto_renew_consent_at = now
    sub.auto_renew_consent_ip = ip
    sub.save(
        update_fields=[
            "auto_renew",
            "auto_renew_requested",
            "canceled_at",
            "cancel_reason",
            "auto_renew_consent_at",
            "auto_renew_consent_ip",
            "updated_at",
        ]
    )
    log_event(
        kind=BillingEvent.Kind.AUTORENEW_ON,
        user=sub.user,
        subscription=sub,
        note="Автопродление включено пользователем",
        ip=ip,
    )
    return sub


def forget_payment_method(sub: Subscription, *, ip: str | None = None) -> Subscription:
    """Удалить привязанное платёжное средство (п. 7.4).

    Удаление на нашей стороне и есть отключение автосписаний: без
    `payment_method_id` списать нечем. Заодно снимаем и само автопродление,
    чтобы не осталось согласия без средства.
    """
    sub.payment_method_id = ""
    sub.payment_method_type = ""
    sub.card_last4 = ""
    sub.card_type = ""
    sub.auto_renew = False
    sub.auto_renew_requested = False
    sub.canceled_at = sub.canceled_at or timezone.now()
    sub.cancel_reason = sub.cancel_reason or "Платёжное средство удалено пользователем"
    sub.save(
        update_fields=[
            "payment_method_id",
            "payment_method_type",
            "card_last4",
            "card_type",
            "auto_renew",
            "auto_renew_requested",
            "canceled_at",
            "cancel_reason",
            "updated_at",
        ]
    )
    log_event(
        kind=BillingEvent.Kind.METHOD_DELETED,
        user=sub.user,
        subscription=sub,
        note="Платёжное средство удалено",
        ip=ip,
    )
    return sub


# ── Возвраты ──────────────────────────────────────────────────────────────────


def period_spend_rub(payment: Payment) -> Decimal:
    """Фактические расходы на запросы пользователя за оплаченный период, ₽.

    Оферта (п. 11.2) разрешает удержать «стоимость обращений к AI-моделям
    сторонних поставщиков, совершённых по запросам Заказчика». Считать её
    руками не нужно: ledger `UsageEvent` уже хранит себестоимость каждого
    ответа в микро-долларах.
    """
    if not (payment.user_id and payment.period_start):
        return Decimal("0.00")
    end = payment.period_end or timezone.now()
    total = (
        UsageEvent.objects.filter(
            user_id=payment.user_id,
            created_at__gte=payment.period_start,
            created_at__lt=end,
        ).aggregate(total=Sum("billable_tokens"))["total"]
        or 0
    )
    usd = Decimal(total) / _MICRO
    return (usd * Decimal(str(USD_RUB_RATE))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def suggest_refund_amount(payment: Payment) -> Decimal:
    """Сколько вернуть при добровольном отказе — подсказка для оператора.

    Формула прямо из п. 11.2: пропорционально полным дням, оставшимся до конца
    периода, за вычетом фактически понесённых расходов. Если платными функциями
    не пользовались и расходов нет — вернётся вся сумма (п. 11.3).
    """
    if not payment.is_refundable:
        return Decimal("0.00")

    remaining = payment.amount
    if payment.period_start and payment.period_end:
        total_days = (payment.period_end - payment.period_start).days or 1
        left_days = max(0, (payment.period_end - timezone.now()).days)
        remaining = (payment.amount * Decimal(left_days) / Decimal(total_days)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

    suggested = remaining - period_spend_rub(payment)
    already = payment.refunded_amount
    cap = payment.amount - already
    return max(Decimal("0.00"), min(suggested, cap))


def refund_payment(
    payment: Payment,
    amount: Decimal,
    *,
    reason: str = Refund.Reason.WITHDRAWAL,
    comment: str = "",
    created_by: str = "system",
) -> Refund:
    """Вернуть деньги тем же способом, которым платили (п. 11.6).

    Возвращать иначе мы не умеем и не должны: ЮKassa проводит возврат на то же
    платёжное средство, отдельного выбора здесь нет.
    """
    if not payment.external_id:
        raise PaymentError("У платежа нет идентификатора в ЮKassa", code="not_refundable")
    if not payment.is_refundable:
        raise PaymentError("По этому платежу нечего возвращать", code="not_refundable")

    amount = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    available = payment.amount - payment.refunded_amount
    if amount <= 0 or amount > available:
        raise PaymentError(
            f"Сумма возврата должна быть от 0.01 до {available} ₽", code="invalid_amount"
        )

    refund = Refund.objects.create(
        payment=payment,
        amount=amount,
        reason=reason,
        comment=comment[:255],
        created_by=created_by[:150],
    )

    payload = {
        "payment_id": payment.external_id,
        "amount": {"value": _money(amount), "currency": payment.currency},
        "description": comment[:128] or "Возврат по подписке Mentor LM",
    }
    try:
        obj = create_refund(payload, idempotence_key=str(refund.idempotence_key))
    except YooKassaError as exc:
        refund.status = Refund.Status.CANCELED
        refund.comment = f"{refund.comment} · ошибка: {exc}"[:255]
        refund.save(update_fields=["status", "comment", "updated_at"])
        raise PaymentError(str(exc), code="provider_unavailable") from exc

    refund.external_id = obj.get("id") or None
    refund.status = obj.get("status", Refund.Status.PENDING)
    refund.save(update_fields=["external_id", "status", "updated_at"])

    if refund.status == Refund.Status.SUCCEEDED:
        _apply_refund_succeeded(refund)
    return refund


def _apply_refund_succeeded(refund: Refund) -> None:
    """Учесть проведённый возврат в платеже и написать пользователю."""
    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(pk=refund.payment_id)
        payment.refunded_amount = (payment.refunded_amount or Decimal("0")) + refund.amount
        payment.save(update_fields=["refunded_amount", "updated_at"])

    log_event(
        kind=BillingEvent.Kind.REFUNDED,
        user=payment.user,
        subscription=payment.subscription,
        note=f"{refund.amount} ₽ — {refund.get_reason_display()}",
    )
    send_async(
        payment.user_email,
        "refund_succeeded",
        {
            "amount": _money(refund.amount),
            "plan_label": _plan_label(payment.plan),
            "reason": refund.get_reason_display(),
        },
    )


def refund_for_missing_notice(payment: Payment, *, reason: str) -> Refund | None:
    """Полный возврат по п. 7.6 — списали после отказа или без уведомления.

    Оферта не оставляет здесь выбора и не допускает удержаний: «возвращает
    списанную сумму в полном объёме». Поэтому функция отдельная и суммы не
    считает — возвращает всё.
    """
    if not payment.is_refundable:
        return None
    logger.error(
        "Списание без основания по платежу %s (%s) — возвращаем полностью",
        payment.pk,
        reason,
    )
    return refund_payment(
        payment,
        payment.amount - payment.refunded_amount,
        reason=reason,
        comment="Автоматический возврат: списание без надлежащего уведомления",
        created_by="system",
    )


# ── Форматирование для писем ──────────────────────────────────────────────────

_MONTHS = (
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)


def format_date(moment) -> str:
    """Дата по-русски для письма: «20 сентября 2026».

    Своё форматирование, а не `date_format`: письмо собирается до запуска
    потока отправки и должно состоять из готовых строк, а локаль в потоке не
    гарантирована.
    """
    if not moment:
        return ""
    local = timezone.localtime(moment)
    return f"{local.day} {_MONTHS[local.month - 1]} {local.year}"
