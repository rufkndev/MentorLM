"""Приём уведомлений от ЮKassa.

Отдельный модуль, а не ещё одна вьюха в `views.py`: это единственная точка
проекта, куда стучится не наш пользователь, а внешняя система, и правила здесь
свои. Три из них выведены прямо из документации ЮKassa, и каждое неочевидно:

1. **Телу уведомления доверять нельзя.** Оно приходит по открытому HTTP-адресу
   без подписи. Единственная настоящая проверка — сходить в API и спросить
   состояние платежа самим. Поэтому объект из тела используется только чтобы
   узнать, о каком платеже речь.

2. **Отвечать всегда 200.** Любой другой код ЮKassa считает неудачей доставки и
   повторяет уведомление сутки. Неизвестный платёж, битый JSON, наша внутренняя
   ошибка — всё это не повод устраивать себе поток повторов: пишем в лог и
   отвечаем 200.

3. **⚠️ Адрес отправителя берётся из `X-Forwarded-For` СПРАВА.** nginx у нас
   настроен как `$proxy_add_x_forwarded_for` (infra/nginx/proxy_params.conf) —
   он ДОПИСЫВАЕТ реальный адрес соединения в конец списка. Левые элементы
   пришли от клиента и подделываются одной строкой в curl. Существующий
   `_client_ip` в apps/users/auth_views.py берёт как раз левый: для счётчика
   попыток входа это нормально, для аллоу-листа — дыра, поэтому здесь своя
   реализация, и подменять её на «общую» нельзя.

CSRF здесь не мешает: DRF проверяет его только для SessionAuthentication, а у
вьюхи `authentication_classes = []` — тот же приём, что в apps/core/views.py.
"""

from __future__ import annotations

import ipaddress
import logging

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Payment
from .payments import apply_provider_state
from .yookassa import YooKassaError, get_payment

logger = logging.getLogger(__name__)

# Сети, из которых ЮKassa шлёт уведомления (из документации). Обновлять только
# по документации провайдера — это ключевая проверка подлинности.
_ALLOWED_NETWORKS = tuple(
    ipaddress.ip_network(cidr)
    for cidr in (
        "185.71.76.0/27",
        "185.71.77.0/27",
        "77.75.153.0/25",
        "77.75.156.11/32",
        "77.75.156.35/32",
        "77.75.154.128/25",
        "2a02:5180::/32",
    )
)

# События, на которые реагируем. Остальные (payouts, deals) к нам не относятся.
_HANDLED_EVENTS = {"payment.succeeded", "payment.canceled", "refund.succeeded"}


def _peer_ip(request) -> str:
    """Адрес, с которого пришёл запрос, — не подделываемый клиентом.

    Берём ПОСЛЕДНИЙ элемент X-Forwarded-For: его дописал наш nginx, всё что
    левее прислал сам клиент. Без nginx (локальный запуск) остаётся REMOTE_ADDR.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.META.get("REMOTE_ADDR", "")


def _is_trusted(ip: str) -> bool:
    """Принадлежит ли адрес сетям ЮKassa."""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(address in network for network in _ALLOWED_NETWORKS)


class WebhookView(APIView):
    """POST /api/billing/webhook/ — уведомления ЮKassa о судьбе платежей."""

    # Открыт наружу: ЮKassa не знает наших токенов. Подлинность проверяется по
    # адресу отправителя и перечитыванием объекта через API.
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        """Принять уведомление и привести локальный платёж в соответствие."""
        ip = _peer_ip(request)
        if not _is_trusted(ip):
            # Единственный случай, когда отвечаем не 200: это не ЮKassa, и
            # повторов от неё не будет — значит, и провоцировать нечего.
            logger.warning("Уведомление биллинга с чужого адреса %s — отклонено", ip)
            return Response({"detail": "forbidden"}, status=403)

        body = request.data if isinstance(request.data, dict) else {}
        event = str(body.get("event", ""))
        obj = body.get("object") or {}

        if event not in _HANDLED_EVENTS:
            logger.info("Уведомление биллинга: событие %r не обрабатывается", event)
            return Response({"status": "ignored"})

        try:
            self._handle(event, obj)
        except Exception:  # noqa: BLE001 — см. правило 2 в докстринге модуля
            logger.exception("Ошибка обработки уведомления %s", event)

        # Всегда 200: иначе ЮKassa будет повторять это уведомление сутки.
        return Response({"status": "ok"})

    def _handle(self, event: str, obj: dict) -> None:
        """Разобрать уведомление и применить состояние из API, а не из тела."""
        if event == "refund.succeeded":
            self._handle_refund(obj)
            return

        payment = self._find_payment(obj)
        if payment is None:
            logger.warning("Уведомление %s о неизвестном платеже %r", event, obj.get("id"))
            return

        # Перечитываем состояние у ЮKassa: телу уведомления не верим.
        try:
            fresh = get_payment(payment.external_id) if payment.external_id else obj
        except YooKassaError as exc:
            logger.warning("Не удалось перечитать платёж %s: %s", payment.pk, exc)
            return

        apply_provider_state(payment, fresh)

    def _find_payment(self, obj: dict) -> Payment | None:
        """Найти наш платёж по идентификатору ЮKassa или по metadata.

        Два пути не избыточны: `external_id` может не успеть сохраниться, если
        процесс упал сразу после создания платежа, — тогда выручает
        `metadata.payment_id`, который мы кладём в каждый запрос сами.
        """
        external_id = obj.get("id")
        if external_id:
            payment = Payment.objects.filter(external_id=external_id).first()
            if payment is not None:
                return payment

        local_id = (obj.get("metadata") or {}).get("payment_id")
        if local_id:
            payment = Payment.objects.filter(pk=local_id).first()
            if payment is not None and external_id and not payment.external_id:
                payment.external_id = external_id
                payment.save(update_fields=["external_id", "updated_at"])
            return payment
        return None

    def _handle_refund(self, obj: dict) -> None:
        """Отметить проведённый возврат.

        Возврат мог быть сделан и не нами — например, руками в кабинете ЮKassa.
        Тогда локальной строки `Refund` нет, но сумму в платеже учесть надо:
        иначе следующий возврат посчитает доступный остаток неправильно.
        """
        from decimal import Decimal

        from django.db import transaction

        from .models import Refund

        refund_id = obj.get("id")
        payment_external_id = obj.get("payment_id")
        amount = Decimal(str((obj.get("amount") or {}).get("value", "0")))

        refund = Refund.objects.filter(external_id=refund_id).first()
        if refund is not None:
            if refund.status == Refund.Status.SUCCEEDED:
                return  # уже учтён
            refund.status = Refund.Status.SUCCEEDED
            refund.save(update_fields=["status", "updated_at"])
            payment = refund.payment
        else:
            payment = Payment.objects.filter(external_id=payment_external_id).first()
            if payment is None:
                logger.warning("Возврат %s по неизвестному платежу", refund_id)
                return
            # Возврат из кабинета: заводим строку, чтобы реестр сходился.
            Refund.objects.create(
                payment=payment,
                external_id=refund_id,
                amount=amount,
                status=Refund.Status.SUCCEEDED,
                reason=Refund.Reason.OTHER,
                comment="Возврат оформлен в кабинете ЮKassa",
                created_by="yookassa",
            )

        with transaction.atomic():
            locked = Payment.objects.select_for_update().get(pk=payment.pk)
            locked.refunded_amount = (locked.refunded_amount or Decimal("0")) + amount
            locked.save(update_fields=["refunded_amount", "updated_at"])
