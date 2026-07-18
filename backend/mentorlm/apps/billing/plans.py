"""Какой тариф реально применять к пользователю — единственное место решения.

`Subscription` — ЕДИНСТВЕННЫЙ источник правды о тарифе. Нет живой подписки → Free.
Никакого кэша плана в профиле нет: тариф всегда считается на лету из подписок,
чтобы не было рассинхрона (истёкшая подписка сразу перестаёт действовать). Ручная
выдача тарифа = `Subscription(provider="manual", status=active)`.
"""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.users.models import UserProfile

from .models import Subscription

# Грейс-период на неуспешную оплату: не отключаем тариф сразу при past_due.
PAST_DUE_GRACE = timedelta(days=3)


def active_subscription(user) -> Subscription | None:
    """Живая подписка пользователя (свежайшая из подходящих) или None.

    Живой считаем: active и (нет срока ИЛИ срок не истёк), плюс past_due внутри
    грейс-периода. Иначе тариф считается неактивным.
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
    """Тариф, лимиты которого реально применяем к пользователю."""
    sub = active_subscription(user)
    return sub.plan if sub else UserProfile.Plan.FREE
