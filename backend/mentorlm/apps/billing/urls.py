"""Маршруты биллинга: оформление, история и управление подпиской."""

from django.urls import path

from .views import (
    CheckoutView,
    PaymentDetailView,
    PaymentListView,
    PaymentMethodView,
    PlanPricesView,
    SubscriptionCancelView,
    SubscriptionResumeView,
)
from .webhooks import WebhookView

urlpatterns = [
    # Цены тарифов — публично: страница /billing открыта и без входа.
    path("billing/plans/", PlanPricesView.as_view(), name="billing-plans"),

    # Оформление и история.
    path("billing/checkout/", CheckoutView.as_view(), name="billing-checkout"),
    path("billing/payments/", PaymentListView.as_view(), name="billing-payments"),
    path(
        "billing/payments/<int:pk>/",
        PaymentDetailView.as_view(),
        name="billing-payment-detail",
    ),

    # Управление автопродлением. Отказ (cancel и удаление карты) намеренно
    # не требует подтверждённой почты: ставить условия для отказа от списаний
    # запрещено (п. 7.4 оферты, ст. 16.1 ЗоЗПП).
    path(
        "billing/subscription/cancel/",
        SubscriptionCancelView.as_view(),
        name="billing-subscription-cancel",
    ),
    path(
        "billing/subscription/resume/",
        SubscriptionResumeView.as_view(),
        name="billing-subscription-resume",
    ),
    path(
        "billing/payment-method/",
        PaymentMethodView.as_view(),
        name="billing-payment-method",
    ),

    # Уведомления ЮKassa. Адрес нужно зарегистрировать в кабинете магазина —
    # см. dev_docs/notes/paymentsNote.md.
    path("billing/webhook/", WebhookView.as_view(), name="billing-webhook"),
]
