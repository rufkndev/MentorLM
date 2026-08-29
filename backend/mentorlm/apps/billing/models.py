"""Модели тарификации: перечень тарифов, подписка пользователя и реестр денег.

Здесь три разных по природе сущности, и путать их не стоит:

* `Subscription` — **состояние**: какой тариф действует сейчас и на каких
  условиях он продлевается. Меняется.
* `Payment` и `Refund` — **реестр**: что произошло с деньгами. Строки только
  добавляются и уточняются статусом, но не переписываются задним числом.
* `BillingEvent` — **журнал**: кто и когда дал или отозвал согласие. Существует
  потому, что оферта (п. 7.4) требует буквально «отказ фиксируется Исполнителем»,
  а доказывать это придётся не нам себе, а в споре.

Отдельно про удаление аккаунта: ссылки на пользователя во всех платёжных
моделях — `SET_NULL`, а не `CASCADE`. Политика конфиденциальности обещает
хранить сведения о платежах не менее пяти лет «независимо от удаления учётной
записи» (законодательство о бухучёте), поэтому каскад из `UserProfile` не имеет
права дотягиваться до этих таблиц. Чтобы записи оставались осмысленными без
пользователя, адрес продублирован снимком в `Payment.user_email`.
"""

from __future__ import annotations

import uuid

from django.db import models

# Как называть способ оплаты человеку. Ключи — значения `payment_method.type`
# из ответа ЮKassa; список неполный намеренно, это словарь для показа, а не
# перечисление допустимых значений — незнакомый тип просто получит нейтральную
# подпись, а не сломает страницу.
PAYMENT_METHOD_TITLES: dict[str, str] = {
    "bank_card": "Банковская карта",
    "sbp": "СБП",
    "sberbank": "SberPay",
    "tinkoff_bank": "T-Pay",
    "mir_pay": "Mir Pay",
    "yoo_money": "ЮMoney",
}

# Способы, с которых мы умеем списывать повторно. Наш магазин подключён к
# автоплатежам по банковской карте — привязать что-то ещё ЮKassa нам не даст,
# и обещать автопродление при другом способе нельзя. Всё, что зависит от этого
# факта (текст на оформлении, объяснение после оплаты), смотрит сюда.
AUTO_RENEW_METHODS: frozenset[str] = frozenset({"bank_card"})

# Почему платёж не прошёл — человеческим языком. Ключи из `cancellation_details.
# reason` ЮKassa. Существует потому, что без причины экран отказа говорит
# «попробуйте ещё раз», и человек честно пробует ту же карту столько раз,
# сколько хватит терпения: при `3d_secure_failed` или `insufficient_funds`
# повтор не поможет никогда, а совет нужен разный.
CANCELLATION_REASONS: dict[str, str] = {
    "3d_secure_failed": "Банк не подтвердил оплату по 3-D Secure. Повторять той "
    "же картой обычно бесполезно — попробуйте другую карту или другой способ.",
    "insufficient_funds": "На карте недостаточно средств.",
    "card_expired": "Срок действия карты истёк.",
    "invalid_card_number": "Номер карты введён неверно.",
    "invalid_csc": "Неверный код с обратной стороны карты.",
    "call_issuer": "Банк отклонил операцию — уточните причину у него.",
    "issuer_unavailable": "Банк не ответил. Попробуйте через несколько минут.",
    "payment_method_restricted": "Банк запретил операции такого типа по этой карте.",
    "payment_method_limit_exceeded": "Превышен лимит операций по этой карте.",
    "country_forbidden": "Оплата картой этой страны не поддерживается.",
    "fraud_suspected": "Операция отклонена как подозрительная.",
    "general_decline": "Банк отклонил операцию без объяснения причины.",
    "expired_on_confirmation": "Оплата не была подтверждена вовремя.",
    "canceled_by_merchant": "Платёж отменён.",
    "identification_required": "Банк требует пройти идентификацию.",
    "internal_timeout": "Платёжный сервис не успел обработать операцию.",
}


class Plan(models.TextChoices):
    """Тарифы — единственное объявление на весь проект.

    Этим enum'ом ключуются тарифные словари (limits.PLAN_LIMITS) и хранится
    план подписки.
    """

    FREE = "free", "Бесплатный"
    PLUS = "plus", "Plus"
    PRO = "pro", "Pro"


class Subscription(models.Model):
    """Подписка — источник правды о тарифе пользователя и его статусе.

    Действующий тариф считается из подписок на лету (plans.effective_plan),
    кэша в профиле нет. Провайдер оплаты — YooKassa.

    Поля автопродления живут здесь же, а не отдельной моделью «согласие»: право
    списывать деньги неотделимо от подписки, к которой оно относится, и
    отключение автопродления не должно требовать заглядывать в другую таблицу.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Ожидает оплаты"
        ACTIVE = "active", "Активна"
        PAST_DUE = "past_due", "Просрочена"
        CANCELED = "canceled", "Отменена"

    user = models.ForeignKey(
        "users.UserProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subscriptions",
    )
    plan = models.CharField(max_length=20, choices=Plan.choices)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    provider = models.CharField(max_length=30, default="yookassa")
    external_id = models.CharField(max_length=255, blank=True, db_index=True)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)

    # ── Автопродление ────────────────────────────────────────────────────────
    # Согласие, а не настройка: по умолчанию False, включается только явным
    # действием пользователя (ст. 16 ЗоЗПП запрещает предпроставленные согласия).
    # ВАЖНО: True здесь означает «мы реально можем списать», а не «человек не
    # против». Флаг включается только вместе с непустым payment_method_id —
    # инвариант держит billing.payments._activate_subscription. Иначе ЛК обещал
    # бы списание, которого технически не может произойти.
    auto_renew = models.BooleanField(default=False, verbose_name="Автопродление")
    # Согласие как факт: галочка на оформлении стояла. Отдельно от auto_renew,
    # потому что согласие может быть дано, а привязка не удаться (оплата не
    # картой, отказ на форме, сбой). Без этого поля «я просил автопродление, а
    # его нет» неотличимо от «я его не просил», и объяснить человеку нечего.
    auto_renew_requested = models.BooleanField(
        default=False, verbose_name="Запрошено автопродление"
    )
    # Когда и с какого адреса согласие дано — доказательство «выраженного
    # согласия» из п. 7.2 оферты и ст. 16.1 ЗоЗПП.
    auto_renew_consent_at = models.DateTimeField(null=True, blank=True)
    auto_renew_consent_ip = models.GenericIPAddressField(null=True, blank=True)

    # Сохранённое платёжное средство в ЮKassa. Реквизитов карты у нас нет и быть
    # не может — только идентификатор привязки и маска для показа в ЛК, иначе
    # человеку нечего было бы «удалять» по п. 7.4.
    payment_method_id = models.CharField(max_length=255, blank=True)
    # Тип способа из ответа ЮKassa (bank_card, sbp, sberbank…). Нужен, чтобы не
    # называть «картой» то, что картой не является: card_last4/card_type
    # заполняются только у банковской карты, у остальных способов их просто нет.
    payment_method_type = models.CharField(max_length=32, blank=True)
    card_last4 = models.CharField(max_length=4, blank=True)
    card_type = models.CharField(max_length=32, blank=True)

    # Когда ушло письмо о предстоящем списании. Ключевое поле: без него
    # автосписание запрещено (п. 7.3 и 7.6 оферты, ФЗ-376).
    renewal_notified_at = models.DateTimeField(null=True, blank=True)
    # Когда ушло письмо «подписка заканчивается, продлите вручную» — зеркало
    # renewal_notified_at для подписок БЕЗ автопродления. Отдельное поле, а не
    # общее: эти два письма исключают друг друга, и общий флаг однажды дал бы
    # «уведомили об окончании» вместо «уведомили о списании».
    expiry_notified_at = models.DateTimeField(null=True, blank=True)
    # Неудачные попытки списания подряд; сбрасывается успешным платежом.
    renewal_attempts = models.PositiveSmallIntegerField(default=0)

    # Отказ от автопродления: фиксируем момент и причину (п. 7.4).
    canceled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)

    # Редакция оферты на момент оплаты: п. 17.4 применяет к договору ту версию,
    # что действовала при оплате, поэтому её нужно помнить.
    offer_version = models.CharField(max_length=20, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Подписка"
        verbose_name_plural = "Подписки"
        ordering = ("-created_at",)
        indexes = [
            # поиск действующей подписки пользователя
            models.Index(fields=["user", "status"]),
            # выборка планировщика: кого пора уведомить и с кого пора списать
            models.Index(fields=["auto_renew", "current_period_end"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.get_plan_display()} ({self.get_status_display()})"

    @property
    def card_title(self) -> str:
        """Как показать привязанный способ оплаты: «Visa •••• 4444».

        Пустая строка = привязки нет, и это единственный признак, по которому
        ЛК отличает «карта привязана» от «списывать нечем». Не-карточные
        способы подписываем по типу: у них нет ни маски, ни платёжной системы,
        и слово «Карта» было бы просто неправдой.
        """
        if not self.payment_method_id:
            return ""
        if self.card_last4:
            return f"{self.card_type or 'Карта'} •••• {self.card_last4}"
        return PAYMENT_METHOD_TITLES.get(self.payment_method_type, "Способ оплаты")


class Payment(models.Model):
    """Платёж — строка реестра денег, наш след операции в ЮKassa.

    Создаётся ДО обращения к провайдеру и только потом дополняется его ответом.
    Порядок именно такой: если процесс упадёт между запросом и ответом, останется
    строка с известным `idempotence_key`, по которой платёж можно найти и
    досинхронизировать. Обратный порядок оставлял бы деньги без следа.

    `idempotence_key` — наш, а не провайдера, и хранится намеренно: повтор
    запроса после сетевого сбоя обязан идти с ТЕМ ЖЕ ключом, иначе ЮKassa
    создаст второй платёж и спишет деньги дважды.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Ожидает оплаты"
        WAITING_FOR_CAPTURE = "waiting_for_capture", "Ожидает подтверждения"
        SUCCEEDED = "succeeded", "Оплачен"
        CANCELED = "canceled", "Отменён"

    class Kind(models.TextChoices):
        INITIAL = "initial", "Первый платёж"
        RENEWAL = "renewal", "Автопродление"
        UPGRADE = "upgrade", "Смена тарифа"

    user = models.ForeignKey(
        "users.UserProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    # Снимок адреса: на него ушёл чек, и запись обязана оставаться читаемой
    # после удаления аккаунта.
    user_email = models.EmailField()
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )

    plan = models.CharField(max_length=20, choices=Plan.choices)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.INITIAL)
    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.PENDING,
    )

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="RUB")

    provider = models.CharField(max_length=30, default="yookassa")
    # id платежа в ЮKassa; появляется после успешного создания.
    external_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    idempotence_key = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    confirmation_url = models.URLField(max_length=1000, blank=True)
    description = models.CharField(max_length=128)

    # Согласие на автосписания, данное при оформлении ЭТОГО платежа. Живёт
    # здесь, а не только в подписке, потому что подписки в момент нажатия
    # кнопки ещё нет, а согласие относится именно к этому моменту — и должно
    # пережить перезапуск процесса между оплатой и уведомлением от ЮKassa.
    auto_renew_requested = models.BooleanField(default=False)
    consent_ip = models.GenericIPAddressField(null=True, blank=True)

    # Что вернула ЮKassa о платёжном средстве. Полный объект платежа не храним:
    # политика конфиденциальности перечисляет платёжные данные исчерпывающе.
    # `payment_method_id` заполняется, ТОЛЬКО если привязка удалась
    # (payment_method.saved == true), — см. billing.payments._method_from.
    payment_method_id = models.CharField(max_length=255, blank=True)
    # Чем человек заплатил (bank_card, sbp, sberbank…). Пишется всегда, даже
    # когда привязки не было: именно по нему экран после оплаты объясняет,
    # почему автопродление не подключилось.
    payment_method_type = models.CharField(max_length=32, blank=True)
    card_last4 = models.CharField(max_length=4, blank=True)
    card_type = models.CharField(max_length=32, blank=True)

    # ── Чек по НПД (ФЗ-422) ──────────────────────────────────────────────────
    # ККТ мы не применяем (п. 2.2 ст. 2 ФЗ-54), поэтому чек формируется вручную
    # в «Мой налог» и его ссылка проставляется здесь. Пустой `npd_receipt_at` у
    # оплаченного платежа = чек ещё не выдан; такие платежи собирает админка и
    # о них напоминает планировщик, потому что срок ограничен законом.
    npd_receipt_url = models.URLField(max_length=500, blank=True)
    npd_receipt_at = models.DateTimeField(null=True, blank=True)

    cancellation_reason = models.CharField(max_length=100, blank=True)
    # Период, который оплачен этим платежом — основа расчёта возврата (п. 11.2).
    period_start = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)
    refunded_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Платёж"
        verbose_name_plural = "Платежи"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.amount} {self.currency} — {self.user_email} ({self.get_status_display()})"

    @property
    def is_refundable(self) -> bool:
        """Есть ли что возвращать: платёж прошёл и возвращено не всё."""
        return self.status == self.Status.SUCCEEDED and self.refunded_amount < self.amount

    @property
    def needs_npd_receipt(self) -> bool:
        """Нужно ли ещё выдать по этому платежу чек «Мой налог» (ФЗ-422)."""
        from .limits import USE_KKT_RECEIPTS

        if USE_KKT_RECEIPTS:
            return False  # чек формирует ОФД, вручную ничего не нужно
        return self.status == self.Status.SUCCEEDED and not self.npd_receipt_at

    @property
    def npd_deadline(self):
        """До какого момента чек обязан быть выдан; None — если не требуется."""
        from .limits import npd_receipt_deadline

        if not (self.needs_npd_receipt and self.paid_at):
            return None
        return npd_receipt_deadline(self.paid_at)


class Refund(models.Model):
    """Возврат по платежу. Причина — не для отчётности, а для нас самих.

    Оферта различает возвраты по основанию: добровольный отказ (п. 11.1, «за
    вычетом фактически понесённых расходов») и обязательный полный возврат при
    списании без уведомления (п. 7.6). Суммы считаются по-разному, и через
    полгода восстановить, почему вернули именно столько, можно будет только
    отсюда.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "В обработке"
        SUCCEEDED = "succeeded", "Проведён"
        CANCELED = "canceled", "Отклонён"

    class Reason(models.TextChoices):
        WITHDRAWAL = "withdrawal", "Отказ от услуги (п. 11.1)"
        NO_NOTICE = "no_notice", "Списание без уведомления (п. 7.6)"
        AFTER_CANCEL = "after_cancel", "Списание после отказа (п. 7.6)"
        SERVICE_FAULT = "service_fault", "Вина Исполнителя (п. 11.4)"
        OTHER = "other", "Иное"

    payment = models.ForeignKey(
        Payment,
        on_delete=models.PROTECT,
        related_name="refunds",
    )
    external_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    idempotence_key = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    reason = models.CharField(
        max_length=30, choices=Reason.choices, default=Reason.WITHDRAWAL
    )
    comment = models.CharField(max_length=255, blank=True)
    # Кто провёл: логин сотрудника из админки либо "system" для авто-возвратов.
    created_by = models.CharField(max_length=150, default="system")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Возврат"
        verbose_name_plural = "Возвраты"
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"Возврат {self.amount} по платежу {self.payment_id}"


class BillingEvent(models.Model):
    """Журнал согласий и денежных действий — то, чем мы отвечаем на претензию.

    Пишется рядом с каждым значимым шагом: дал согласие, отозвал, уведомили о
    списании, списали, не смогли списать, вернули. Строки только добавляются.
    """

    class Kind(models.TextChoices):
        CONSENT_GIVEN = "consent_given", "Согласие на автосписания"
        AUTORENEW_ON = "autorenew_on", "Автопродление включено"
        AUTORENEW_OFF = "autorenew_off", "Автопродление отключено"
        METHOD_DELETED = "method_deleted", "Платёжное средство удалено"
        RENEWAL_NOTIFIED = "renewal_notified", "Уведомление о списании"
        CHARGED = "charged", "Списание проведено"
        CHARGE_FAILED = "charge_failed", "Списание не прошло"
        REFUNDED = "refunded", "Возврат"

    user = models.ForeignKey(
        "users.UserProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_events",
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    kind = models.CharField(max_length=30, choices=Kind.choices)
    note = models.CharField(max_length=255, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Событие биллинга"
        verbose_name_plural = "События биллинга"
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} — {self.user} ({self.created_at:%d.%m.%Y %H:%M})"


def log_event(
    *,
    kind: str,
    user=None,
    subscription=None,
    note: str = "",
    ip: str | None = None,
) -> None:
    """Записать событие в журнал. Никогда не роняет вызывающий код.

    Журнал важен, но не важнее операции, рядом с которой пишется: провалившаяся
    запись в лог не повод не зачесть человеку оплату.
    """
    import logging

    try:
        BillingEvent.objects.create(
            kind=kind,
            user=user,
            subscription=subscription,
            note=note[:255],
            ip=ip or None,
        )
    except Exception:  # noqa: BLE001 — журнал не имеет права ронять платёж
        logging.getLogger(__name__).exception("Не удалось записать событие биллинга %s", kind)
