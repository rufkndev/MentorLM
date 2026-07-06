"""Тарифные лимиты — единственный источник правды о числах тарифа.

Гибридная модель защиты от перерасхода на API:
- `monthly_cost_rub` — месячный бюджет СЕБЕСТОИМОСТИ (главный предохранитель);
- `daily_messages` — дневной cap сообщений (анти-спам, не про деньги);
- `daily_research` / `daily_code` — суб-лимиты дорогих режимов;
- `rate_per_min` — защита от частых запросов подряд;
- `max_output_tokens` — жёсткий потолок длины ответа на тариф (фин. предохранитель);
- `allowed_tiers` — какие продуктовые тиры моделей (default/fast/quality) доступны;
- `allow_web_search` — доступен ли веб-поиск (режим «Исследовать»);
- `context_tokens` — бюджет контекста (используется в ai/context.py).

Числа подбираемые: ориентир — себестоимость активного пользователя в месяц.
Проверки читают это через `limits_for(plan)`; порядок слоёв (CLAUDE.md):
тариф (потолок) > сценарий (база и границы) > настройка пользователя (сдвиг).
"""

from decimal import Decimal

from apps.users.models import UserProfile

# Все продуктовые тиры моделей (см. ai/preferences.MODEL_TIER_CHOICES).
_ALL_TIERS = {"default", "fast", "quality"}

PLAN_LIMITS = {
    UserProfile.Plan.FREE: {
        "label": "Бесплатный",
        "context_tokens": 8_000,
        "daily_messages": 20,
        "monthly_cost_rub": Decimal("30"),
        "daily_research": 3,
        "daily_code": 5,
        "rate_per_min": 4,
        "max_output_tokens": 2_048,
        "allowed_tiers": {"default", "fast"},
        "allow_web_search": False,
    },
    UserProfile.Plan.PLUS: {
        "label": "Plus",
        "context_tokens": 32_000,
        "daily_messages": 150,
        "monthly_cost_rub": Decimal("120"),
        "daily_research": 30,
        "daily_code": 40,
        "rate_per_min": 15,
        "max_output_tokens": 8_192,
        "allowed_tiers": _ALL_TIERS,
        "allow_web_search": True,
    },
    UserProfile.Plan.PRO: {
        "label": "Pro",
        "context_tokens": 128_000,
        "daily_messages": 400,
        "monthly_cost_rub": Decimal("350"),
        "daily_research": 150,
        "daily_code": 200,
        "rate_per_min": 25,
        "max_output_tokens": 16_384,
        "allowed_tiers": _ALL_TIERS,
        "allow_web_search": True,
    },
}


def limits_for(plan: str) -> dict:
    """Лимиты для плана; по умолчанию — Free."""
    return PLAN_LIMITS.get(plan, PLAN_LIMITS[UserProfile.Plan.FREE])
