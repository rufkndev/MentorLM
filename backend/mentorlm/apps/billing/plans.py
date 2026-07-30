"""Какой тариф реально применять к пользователю — единственное место решения.

Считается на лету из подписок, без кэша в профиле: истёкшая подписка сразу
перестаёт действовать. Ручная выдача тарифа = Subscription(provider="manual").
"""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import Plan, Subscription

# Грейс на неуспешную оплату: не отключаем тариф сразу при past_due.
PAST_DUE_GRACE = timedelta(days=3)


def active_subscription(user) -> Subscription | None:
    """Действующая подписка пользователя (свежайшая из подходящих) или None.

    Действующая — active с неистёкшим сроком (или вовсе без срока), а также
    past_due внутри грейс-периода.
    """
    now = timezone.now()
    alive = Q(status=Subscription.Status.ACTIVE) & (
        Q(current_period_end__isnull=True) | Q(current_period_end__gt=now)
    )
    grace = Q(status=Subscription.Status.PAST_DUE) & Q(
        current_period_end__gt=now - PAST_DUE_GRACE
    )
    return (
        Subscription.objects.filter(user=user)
        .filter(alive | grace)
        .order_by("-created_at")
        .first()
    )


def effective_plan(user) -> str:
    """Тариф, лимиты которого применяем к пользователю; без подписки — Free."""
    sub = active_subscription(user)
    return sub.plan if sub else Plan.FREE
