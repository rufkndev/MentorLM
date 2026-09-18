"""Эндпоинты биллинга: оформление, история, управление подпиской, вебхук.

Вьюхи здесь намеренно тонкие — вся логика денег живёт в `payments.py`. Каждая
делает три вещи: разобрать запрос, позвать сервис, вернуть ответ.

⚠️ На всё, что связано с деньгами, вешается `EmailVerified` (apps/users/
permissions.py). Не для галочки: с первого списания мы обязаны присылать чек
(54-ФЗ) и предупреждение за 24 часа (ФЗ-376), а на непроверенный адрес это
недоставляемо. Отключение автопродления и просмотр истории под этим правилом
НЕ ходят — перекрыть человеку возможность отказаться от списаний было бы прямым
нарушением п. 7.4 оферты.
"""

from __future__ import annotations

import ipaddress
import logging

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import EmailVerified

from .limits import PLAN_PRICE_RUB, limits_for
from .models import Payment, Plan, Subscription
from .payments import (
    PaymentError,
    cancel_autorenew,
    enable_autorenew,
    forget_payment_method,
    start_checkout,
    sync_payment,
)
from .plans import active_subscription
from .serializers import CheckoutSerializer, PaymentSerializer

logger = logging.getLogger(__name__)

# Сколько операций показываем в истории ЛК.
PAYMENTS_PAGE_SIZE = 50

# Через сколько секунд после создания есть смысл переспрашивать статус у
# ЮKassa. Человек возвращается с формы за секунды, вебхук может отстать —
# опрос закрывает эту дыру, но дёргать провайдера на каждый запрос незачем.
SYNC_AFTER_SECONDS = 2


def _client_ip(request) -> str | None:
    """IP клиента для фиксации согласия (см. infra/nginx/proxy_params.conf)."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    raw = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR", "")
    try:
        ipaddress.ip_address(raw)
    except ValueError:
        return None
    return raw


def _error(exc: PaymentError, code: int = status.HTTP_400_BAD_REQUEST) -> Response:
    """Ошибка сервиса в том же формате, что и остальные ошибки API."""
    return Response({"code": exc.code, "message": str(exc)}, status=code)


class PlanPricesView(APIView):
    """GET /api/billing/plans/ — актуальные цены тарифов.

    Публичный: страница тарифов открыта и без входа. Существует затем, чтобы
    цена жила в ОДНОМ месте (billing/limits.py). Фронт держит цены только как
    запасные значения на случай недоступного API — иначе смена цены требовала
    бы правки в двух местах и однажды разошлась бы с той, что реально
    списывается.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        """Цена и название каждого тарифа в рублях за расчётный период."""
        return Response(
            {
                "plans": [
                    {
                        "id": plan,
                        "label": limits_for(plan)["label"],
                        "price": PLAN_PRICE_RUB.get(plan, 0),
                        "currency": "RUB",
                    }
                    for plan in (Plan.FREE, Plan.PLUS, Plan.PRO)
                ]
            }
        )


class CheckoutView(APIView):
    """POST /api/billing/checkout/ — создать платёж за тариф."""

    permission_classes = [EmailVerified]
    # Каждый вызов заводит строку Payment и идёт живым запросом в ЮKassa.
    # Человек оформляет подписку раз в месяц, десяти попыток в час хватит с
    # запасом даже на «передумал и вернулся».
    throttle_scope = "checkout"

    def post(self, request):
        """Оформить подписку и вернуть адрес платёжной формы ЮKassa."""
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            payment = start_checkout(
                request.user,
                data["plan"],
                auto_renew=data["auto_renew"],
                ip=_client_ip(request),
            )
        except PaymentError as exc:
            # 503 — провайдер лежит, повтор осмыслен. 502 — провайдер отверг
            # запрос: виноваты мы (настройки магазина), и клиент это не
            # починит. 400 — виноват сам запрос.
            code = {
                "provider_unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
                "provider_rejected": status.HTTP_502_BAD_GATEWAY,
            }.get(exc.code, status.HTTP_400_BAD_REQUEST)
            return _error(exc, code)

        if not payment.confirmation_url:
            # ЮKassa приняла платёж, но не дала адрес формы — платить негде.
            return Response(
                {
                    "code": "no_confirmation_url",
                    "message": "Платёжный сервис не вернул форму оплаты. "
                    "Попробуйте ещё раз.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {"payment_id": payment.pk, "confirmation_url": payment.confirmation_url},
            status=status.HTTP_201_CREATED,
        )


class PaymentListView(APIView):
    """GET /api/billing/payments/ — история операций пользователя."""

    def get(self, request):
        """Последние платежи и возвраты — то, что видно в ЛК."""
        payments = Payment.objects.filter(user=request.user)[:PAYMENTS_PAGE_SIZE]
        return Response({"results": PaymentSerializer(payments, many=True).data})


class PaymentDetailView(APIView):
    """GET /api/billing/payments/<id>/ — статус платежа.

    Страница возврата с платёжной формы опрашивает этот эндпоинт. Если платёж
    всё ещё не завершён, состояние перечитывается у ЮKassa прямо здесь: так
    тариф включается сразу после редиректа и не зависит от того, дошёл ли
    вебхук — а он может задержаться или потеряться.
    """

    def get(self, request, pk: int):
        """Актуальный статус платежа, при необходимости — с досинхронизацией."""
        payment = Payment.objects.filter(pk=pk, user=request.user).first()
        if payment is None:
            return Response(
                {"code": "not_found", "message": "Платёж не найден"},
                status=status.HTTP_404_NOT_FOUND,
            )

        unfinished = payment.status in (
            Payment.Status.PENDING,
            Payment.Status.WAITING_FOR_CAPTURE,
        )
        if unfinished and payment.external_id:
            payment = sync_payment(payment)

        return Response(PaymentSerializer(payment).data)


class SubscriptionCancelView(APIView):
    """POST /api/billing/subscription/cancel/ — отключить автопродление.

    Без `EmailVerified` намеренно: отказ от списаний должен приниматься всегда
    и без препятствий (п. 7.4 оферты, ст. 16.1 ЗоЗПП). Требовать сначала
    подтвердить почту значило бы поставить условие для отказа.
    """

    def post(self, request):
        """Зафиксировать отказ; доступ к тарифу сохранится до конца периода."""
        sub = active_subscription(request.user)
        if sub is None:
            return Response(
                {"code": "no_subscription", "message": "Активной подписки нет"},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not sub.auto_renew:
            return Response(
                {"code": "already_canceled", "message": "Автопродление уже отключено"},
                status=status.HTTP_409_CONFLICT,
            )

        reason = str(request.data.get("reason", ""))[:255]
        cancel_autorenew(sub, reason=reason, ip=_client_ip(request))
        return Response(
            {
                "auto_renew": False,
                "access_until": sub.current_period_end.isoformat()
                if sub.current_period_end
                else None,
            }
        )


class SubscriptionResumeView(APIView):
    """POST /api/billing/subscription/resume/ — включить автопродление обратно."""

    permission_classes = [EmailVerified]

    def post(self, request):
        """Возобновить списания по сохранённой карте."""
        sub = active_subscription(request.user)
        if sub is None:
            return Response(
                {"code": "no_subscription", "message": "Активной подписки нет"},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            enable_autorenew(sub, ip=_client_ip(request))
        except PaymentError as exc:
            return _error(exc)
        return Response(
            {
                "auto_renew": True,
                "renews_at": sub.current_period_end.isoformat()
                if sub.current_period_end
                else None,
            }
        )


class PaymentMethodView(APIView):
    """DELETE /api/billing/payment-method/ — удалить привязанную карту.

    Прямая реализация п. 7.4: «удаление привязанного платёжного средства» —
    один из трёх названных в оферте способов отказаться от списаний.
    """

    def delete(self, request):
        """Забыть платёжное средство; списывать после этого нечем."""
        sub = (
            Subscription.objects.filter(user=request.user)
            .exclude(payment_method_id="")
            .order_by("-created_at")
            .first()
        )
        if sub is None:
            return Response(
                {"code": "no_payment_method", "message": "Привязанной карты нет"},
                status=status.HTTP_404_NOT_FOUND,
            )
        forget_payment_method(sub, ip=_client_ip(request))
        return Response(status=status.HTTP_204_NO_CONTENT)
