"""Preflight-guard: единая проверка лимитов перед ИИ-запросом.

Идея — не дать пользователю или боту сжечь деньги на API. Перед каждым запросом
проверяем по порядку (дёшево → дорого) и на первом провале бросаем
`LimitExceeded`, который вьюха превращает в JSON-ответ с нужным HTTP-статусом
ДО старта SSE-стрима. Успешный запрос списывается постфактум (apps.usage).

Порядок слоёв защиты:
    1. активный тариф → его лимиты
    2. rate limit (частые запросы подряд) — анти-спам
    3. дневной cap сообщений — анти-спам
    4. месячный бюджет себестоимости — ГЛАВНЫЙ финансовый предохранитель
    5. суб-лимит дорогого режима (research/code)
    6. слишком длинный ввод
    7. доступность фичи тарифу (тир модели)
"""

from __future__ import annotations

from datetime import date

from django.core.cache import cache
from django.db.models import Sum
from django.utils import timezone

from apps.ai.context import count_tokens
from apps.usage.models import Usage

from .limits import limits_for
from .plans import effective_plan

# Поле настроек с продуктовым тиром модели для каждого режима.
_MODE_TIER_FIELD = {
    "chat": "chat_model",
    "code": "code_model",
    "research": "research_model",
}
# Суб-лимиты дорогих режимов: режим → ключ дневного лимита в PLAN_LIMITS.
_MODE_DAILY_LIMIT = {
    "research": "daily_research",
    "code": "daily_code",
}
_MODE_LABEL = {"research": "исследований", "code": "запросов кода"}


class LimitExceeded(Exception):
    """Лимит тарифа исчерпан. Несёт машинный code, текст и HTTP-статус."""

    def __init__(self, code: str, message: str, status: int, **extra):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.extra = extra


def _month_start() -> date:
    today = date.today()
    return today.replace(day=1)


def preflight(user, *, mode: str, scenario: str | None, input_text: str) -> None:
    """Проверяет все лимиты; бросает LimitExceeded при первом провале."""
    plan = effective_plan(user)
    limits = limits_for(plan)

    # 2. Rate limit — фиксированное окно в минуту (django.core.cache).
    # В prod кэш должен быть общий (Redis); LocMem ок для одного воркера в dev.
    rate = limits["rate_per_min"]
    minute = timezone.now().strftime("%Y%m%d%H%M")
    key = f"rl:{user.pk}:{minute}"
    cache.add(key, 0, timeout=60)
    try:
        count = cache.incr(key)
    except ValueError:  # ключ истёк между add и incr — начинаем окно заново
        cache.set(key, 1, timeout=60)
        count = 1
    if count > rate:
        raise LimitExceeded(
            "rate_limited",
            "Слишком часто. Подождите немного и попробуйте снова.",
            status=429,
        )

    # 3. Дневной cap сообщений (сумма по всем режимам за сегодня).
    daily_limit = limits["daily_messages"]
    today_total = (
        Usage.objects.filter(user=user, day=date.today()).aggregate(
            n=Sum("request_count")
        )["n"]
        or 0
    )
    if daily_limit is not None and today_total >= daily_limit:
        raise LimitExceeded(
            "daily_messages",
            f"Дневной лимит сообщений исчерпан ({daily_limit}). "
            "Он обновится завтра — или перейдите на тариф выше.",
            status=429,
            limit=daily_limit,
        )

    # 4. Месячный бюджет себестоимости — главный финансовый предохранитель.
    budget = limits["monthly_cost_rub"]
    month_cost = (
        Usage.objects.filter(user=user, day__gte=_month_start()).aggregate(
            c=Sum("cost_rub")
        )["c"]
        or 0
    )
    if budget is not None and month_cost >= budget:
        raise LimitExceeded(
            "monthly_budget",
            "Месячный лимит тарифа исчерпан. Он обновится в начале месяца — "
            "или перейдите на тариф выше, чтобы продолжить сейчас.",
            status=429,
        )

    # 5. Суб-лимит дорогого режима (research/code).
    sub_key = _MODE_DAILY_LIMIT.get(mode)
    if sub_key:
        mode_limit = limits[sub_key]
        mode_today = (
            Usage.objects.filter(user=user, day=date.today(), mode=mode)
            .aggregate(n=Sum("request_count"))["n"]
            or 0
        )
        if mode_limit is not None and mode_today >= mode_limit:
            label = _MODE_LABEL.get(mode, "запросов")
            raise LimitExceeded(
                "mode_daily_limit",
                f"Дневной лимит {label} исчерпан ({mode_limit}). "
                "Он обновится завтра — или перейдите на тариф выше.",
                status=429,
                limit=mode_limit,
                mode=mode,
            )

    # 6. Слишком длинный ввод (защита от разового дорогого запроса).
    max_input = max(1, limits["context_tokens"] // 2)
    if count_tokens(input_text, "gpt-4o") > max_input:
        raise LimitExceeded(
            "input_too_long",
            "Сообщение слишком длинное для вашего тарифа. "
            "Сократите его или перейдите на тариф выше.",
            status=413,
            limit=max_input,
        )

    # 7. Доступность тира модели тарифу (апселл на quality).
    tier_field = _MODE_TIER_FIELD.get(mode)
    chosen_tier = getattr(user.settings, tier_field, "default") if tier_field else "default"
    if chosen_tier not in limits["allowed_tiers"]:
        raise LimitExceeded(
            "feature_locked",
            "Максимальная модель доступна на платных тарифах. "
            "Выберите стандартную модель в настройках или перейдите на тариф выше.",
            status=402,
            tier=chosen_tier,
        )
