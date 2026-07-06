"""Какой тариф реально применять к пользователю — единственное место решения.

`UserProfile.plan` — закэшированный тариф. Но платный тариф действует, только
пока подписка активна. Здесь мы деградируем до Free, если у платного плана нет
живой подписки (просрочена/отменена). Пока приём оплаты (YooKassa) не подключён,
подписок обычно нет — тогда доверяем `UserProfile.plan` как есть. Это готовый
хук: как появится биллинг, логика статуса подписки меняется в одной точке.
"""

from __future__ import annotations

from apps.users.models import UserProfile

from .models import Subscription


def effective_plan(user) -> str:
    """Тариф, лимиты которого реально применяем к пользователю."""
    plan = user.plan
    if plan == UserProfile.Plan.FREE:
        return plan

    # Платный тариф действует только с активной подпиской. Если подписки вообще
    # нет (биллинг ещё не подключён) — доверяем закэшированному plan, чтобы можно
    # было выдавать тариф вручную через админку.
    has_subs = Subscription.objects.filter(user=user).exists()
    if not has_subs:
        return plan

    active = Subscription.objects.filter(
        user=user, plan=plan, status=Subscription.Status.ACTIVE
    ).exists()
    return plan if active else UserProfile.Plan.FREE
