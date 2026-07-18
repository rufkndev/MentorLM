"""Тарифные лимиты — ЕДИНСТВЕННЫЙ файл настройки тарифов и стоимости.

Все числа, которые крутят при настройке экономики, живут здесь: вес токена,
цена веб-поиска, скользящие окна и квоты по тарифам. `record_usage` и `guard`
читают их отсюда — больше нигде цифр нет.

Расход измеряется в РАСЧЁТНЫХ ТОКЕНАХ, денег в рантайме нет:

    billable = (tokens_in + tokens_out * OUTPUT_WEIGHT) * MODEL_COST_FACTOR[model]
             + web_search_calls * WEB_SEARCH_CALL_TOKENS

Две поправки делают billable ≈ реальной стоимости в МИКРО-ДОЛЛАРАХ ($·1e-6):

1. OUTPUT_WEIGHT — выходной токен дороже входного (≈ средний out/in по нашим
   моделям). Универсально для всех моделей.
2. MODEL_COST_FACTOR — цена входа модели в $/1M токенов. Разные тиры настройки
   «Модель ИИ» (default/fast/quality) выбирают РАЗНЫЕ по цене модели в одном
   режиме — без множителя дешёвый `fast` жёг бы ту же квоту, что дорогой
   `default`. Множитель закрывает эту дыру: дорогая модель ест квоту
   пропорционально своей цене. Неизвестная модель → консервативный дефолт (не 0,
   чтобы не было дыры «неизвестная модель = бесплатно»).

Плоская плата за веб-поиск ($0.01 = 10_000 µ$) НЕ умножается на factor — это цена
инструмента, а не токенов.

Итого 1 billable ≈ 1 µ$ реальной стоимости модели, единая единица для всех
режимов и моделей. Квота режима = «бюджет µ$ на окно».

Квоты — по режимам (chat/code/research), у каждого свой пул. На каждый режим два
СКОЛЬЗЯЩИХ окна: 5 часов (анти-берст, быстро восстанавливается) и 7 дней
(главный предохранитель бизнеса). Считаются как SUM(billable_tokens) по
UsageEvent за `now - окно`.

Числа выведены из реальных цен моделей (2026) при принципе «кит на потолке
лимитов уходит в ноль» (расход на 100% лимита ≈ net-выручке тарифа), маржа — с
того, что средний юзер использует малую долю квоты. Пересчитывать при смене
моделей/прайса/цен тарифов.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from apps.users.models import UserProfile

# Все продуктовые тиры моделей (см. ai/preferences.MODEL_TIER_CHOICES).
_ALL_TIERS = {"default", "fast", "quality"}

# Стоимость расхода в расчётных токенах. Пересчитывать при смене моделей/прайса.
OUTPUT_WEIGHT = 6  # выходной токен ≈ в 6 раз дороже входного (средний out/in)

# Множитель стоимости модели = цена входа модели в $/1M токенов. Умножает
# токен-часть billable → billable ≈ реальная стоимость в µ$. Ключ — реальный id
# модели (см. settings/env и ai.registry/preferences). Обновлять при смене
# прайса моделей.
MODEL_COST_FACTOR: dict[str, float] = {
    # OpenAI (chat / research / память / деградация)
    "gpt-5.5": 5.0,
    "gpt-5": 0.63,
    "gpt-5-mini": 0.13,
    "gpt-5-nano": 0.05,
    "gpt-4o-mini": 0.15,
    # Anthropic (код)
    "claude-sonnet-4-6": 3.0,
    "claude-haiku-4-5": 1.0,
}
# Неизвестная/новая модель → консервативно как флагман (не 0: без дыры
# «неизвестная модель = бесплатно»).
DEFAULT_COST_FACTOR = 5.0

# Плоская плата за один вызов веб-поиска OpenAI ($0.01 = 10_000 µ$), отдельно от
# токенов. НЕ умножается на MODEL_COST_FACTOR — это цена инструмента.
WEB_SEARCH_CALL_TOKENS = 10_000


def cost_factor(model: str) -> float:
    """Множитель стоимости модели; неизвестная модель → консервативный дефолт."""
    return MODEL_COST_FACTOR.get(model, DEFAULT_COST_FACTOR)

# Скользящие окна квоты: ключ → (длительность, человекочитаемое имя).
QUOTA_WINDOWS: dict[str, tuple[timedelta, str]] = {
    "burst": (timedelta(hours=5), "5 часов"),
    "week": (timedelta(days=7), "7 дней"),
}

# Деградация: когда квота режима исчерпана, вместо жёсткого блока даём столько
# запросов на дешёвой модели (см. registry.degrade_model), затем — полный блок до
# восстановления окна. Считается по исчерпанному окну, поэтому «отпускает» вместе
# с ним.
DEGRADE_REQUESTS = 5


@dataclass(frozen=True)
class ModeQuota:
    """Квота режима в расчётных токенах на каждое скользящее окно.

    None — безлимит (окно не проверяется); 0 — режим недоступен на тарифе.
    """

    burst: int | None
    week: int | None

    def limit(self, window: str) -> int | None:
        return getattr(self, window)


PLAN_LIMITS = {
    UserProfile.Plan.FREE: {
        "label": "Бесплатный",
        "context_tokens": 8_000,
        "max_output_tokens": 2_048,
        "rate_per_min": 4,
        "allowed_tiers": {"default", "fast"},
        "allow_web_search": False,
        # Free — узкий триал «попробовать» (платит 0 ₽, break-even неприменим).
        "quotas": {
            "chat": ModeQuota(burst=40_000, week=230_000),
            "code": ModeQuota(burst=40_000, week=130_000),
            "research": ModeQuota(burst=45_000, week=130_000),
        },
    },
    UserProfile.Plan.PLUS: {
        "label": "Plus",
        "context_tokens": 32_000,
        "max_output_tokens": 8_192,
        "rate_per_min": 15,
        "allowed_tiers": _ALL_TIERS,
        "allow_web_search": True,
        # Plus 990 ₽ (net ≈ $11.3/мес). Сумма week-квот ≈ net при break-even.
        "quotas": {
            "chat": ModeQuota(burst=210_000, week=1_450_000),
            "code": ModeQuota(burst=80_000, week=530_000),
            "research": ModeQuota(burst=95_000, week=660_000),
        },
    },
    UserProfile.Plan.PRO: {
        "label": "Pro",
        "context_tokens": 128_000,
        "max_output_tokens": 16_384,
        "rate_per_min": 25,
        "allowed_tiers": _ALL_TIERS,
        "allow_web_search": True,
        # Pro 2490 ₽ (net ≈ $28.5/мес). Сумма week-квот ≈ net при break-even.
        "quotas": {
            "chat": ModeQuota(burst=520_000, week=3_650_000),
            "code": ModeQuota(burst=190_000, week=1_330_000),
            "research": ModeQuota(burst=240_000, week=1_660_000),
        },
    },
}

# Человекочитаемые имена режимов для сообщений об исчерпании квоты.
MODE_LABEL = {"chat": "«Общий»", "code": "«Код»", "research": "«Исследовать»"}


def limits_for(plan: str) -> dict:
    """Лимиты для плана; по умолчанию — Free."""
    return PLAN_LIMITS.get(plan, PLAN_LIMITS[UserProfile.Plan.FREE])


def quota_for(plan: str, mode: str) -> ModeQuota:
    """Квота режима; неизвестный режим → квота chat (консервативно)."""
    quotas = limits_for(plan)["quotas"]
    return quotas.get(mode) or quotas["chat"]


def billable_tokens(
    tokens_in: int,
    tokens_out: int,
    web_search_calls: int = 0,
    *,
    model: str = "",
) -> int:
    """Перевод фактического расхода в расчётные токены ≈ µ$ (единица квот).

    Токен-часть умножается на множитель стоимости модели; плоская плата за
    веб-поиск — нет (это цена инструмента, не токенов). Пустой/неизвестный
    `model` → консервативный дефолт-множитель.
    """
    token_cost = (tokens_in + tokens_out * OUTPUT_WEIGHT) * cost_factor(model)
    return round(token_cost) + web_search_calls * WEB_SEARCH_CALL_TOKENS
