"""Тарифы, цены моделей и лимиты — единственный файл настройки экономики.

Все числа, которые крутят при её настройке, живут здесь; guard и record_usage
только читают их отсюда.

Единица расхода — МИКРО-ДОЛЛАР ($·1e-6), целыми числами (float копил бы ошибку
при суммировании ledger'а):

    cost_µ$ = tokens_in * price_in + tokens_out * price_out
            + web_search_calls * WEB_SEARCH_CALL_COST

Цена в $/1M токенов численно равна µ$ за токен, поэтому формула сразу даёт µ$.
Квоты авторуются в долларах и переводятся в те же µ$ (`_plan_quotas`).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from .models import Plan

# Все продуктовые тиры моделей (см. ai.preferences.MODEL_TIER_CHOICES).
_ALL_TIERS = {"default", "fast", "quality"}


# ── Цены моделей ──────────────────────────────────────────────────────────────
# Ключ — реальный id модели из env; значение — (вход, выход) в $/1M токенов.
# Добавить модель = одна строка. ⚠️ Сверять с прайсом провайдеров.
MODEL_PRICES: dict[str, tuple[float, float]] = {
    # OpenAI (chat / research / память / деградация)
    "gpt-5.5": (5.00, 15.00),
    "gpt-5": (0.63, 5.00),
    "gpt-5-mini": (0.13, 1.00),
    "gpt-5-nano": (0.05, 0.40),
    "gpt-4o-mini": (0.15, 0.60),
    # Anthropic (код)
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}
# Неизвестная модель считается как флагман — чтобы не было дыры «нет в списке = даром».
DEFAULT_PRICE = (5.00, 15.00)

# Плоская плата за вызов веб-поиска ($0.01): цена инструмента, а не токенов.
WEB_SEARCH_CALL_COST = 10_000

# Потолок поисков в ОДНОМ ответе: без него дотошный ответ уходил в десятки
# вызовов и в одиночку съедал недельную квоту. Отдаём провайдеру как
# max_tool_calls, а если он его не примет — режем сами (openai_research).
WEB_SEARCH_CALLS_PER_ANSWER = 8


def usage_cost(
    tokens_in: int,
    tokens_out: int,
    web_search_calls: int = 0,
    *,
    model: str = "",
) -> int:
    """Себестоимость запроса в µ$ — единица, в которой считаются квоты."""
    price_in, price_out = MODEL_PRICES.get(model, DEFAULT_PRICE)
    token_cost = tokens_in * price_in + tokens_out * price_out
    return round(token_cost) + web_search_calls * WEB_SEARCH_CALL_COST


# ── Глобальные потолки-предохранители (едины для всех тарифов) ────────────────
RATE_PER_MIN = 5  # запросов в минуту, анти-спам (общий кэш — settings.CACHES)
MAX_OUTPUT_TOKENS = 30_000  # потолок ответа — обрез на уровне провайдера
MAX_INPUT_TOKENS = 100_000  # потолок ввода — reject до вызова модели
MAX_CONTEXT_MESSAGES = 30  # абсолютный потолок длины предыстории

# Wall-clock таймаут генерации, по режимам: «нормальная» длина ответа у них
# отличается на порядок, а «Исследовать» молчит минутами, пока модель ходит по
# сайтам. Проверяется между дельтами (conversations.views).
REQUEST_TIMEOUT_SECONDS = {"chat": 180, "code": 300, "research": 900}
DEFAULT_REQUEST_TIMEOUT_SECONDS = 180


def request_timeout(mode: str) -> int:
    """Потолок времени генерации для режима, секунды."""
    return REQUEST_TIMEOUT_SECONDS.get(mode, DEFAULT_REQUEST_TIMEOUT_SECONDS)


# По самому долгому ответу выставляется TTL лока генерации.
MAX_REQUEST_TIMEOUT_SECONDS = max(REQUEST_TIMEOUT_SECONDS.values())

# Скользящие окна квоты: ключ → (длительность, подпись для пользователя).
QUOTA_WINDOWS: dict[str, tuple[timedelta, str]] = {
    "burst": (timedelta(hours=5), "5 часов"),
    "week": (timedelta(days=7), "7 дней"),
}

# Сколько ответов на дешёвой модели даём после исчерпания квоты вместо жёсткого
# блока. Считается по исчерпанному окну, поэтому «отпускает» вместе с ним.
DEGRADE_REQUESTS = 5


@dataclass(frozen=True)
class ModeQuota:
    """Квота режима в µ$ на каждое окно; None — безлимит, 0 — режим недоступен."""

    burst: int | None
    week: int | None

    def limit(self, window: str) -> int | None:
        """Лимит по ключу окна из QUOTA_WINDOWS."""
        return getattr(self, window)


# $1 = 1_000_000 µ$ — множитель перевода авторских долларов в единицу расхода.
_MICRO = 1_000_000

# Доли режимов в месячном бюджете тарифа (сумма = 1).
_MODE_SHARES = {"chat": 5 / 12, "code": 4 / 12, "research": 3 / 12}

# Доля недельной квоты, доступная в одном 5ч-окне. Время-пропорционально было бы
# 5/168 ≈ 0.03 — это запрет всплесков и ~1 ответ за 5 часов; 25% пропускают
# нормальную учебную сессию, не трогая недельный потолок.
BURST_SHARE_OF_WEEK = 0.25


def _plan_quotas(monthly_usd: float) -> dict[str, ModeQuota]:
    """Раскидать месячный бюджет тарифа по режимам и окнам, вернуть µ$.

    Месяц → доля режима → неделя = месяц / 4 (главный потолок) → 5ч-окно =
    доля недели (ограничивает скорость расхода, но разрешает сессию).
    """
    quotas: dict[str, ModeQuota] = {}
    for mode, share in _MODE_SHARES.items():
        week = round(monthly_usd * share / 4 * _MICRO)
        quotas[mode] = ModeQuota(burst=round(week * BURST_SHARE_OF_WEEK), week=week)
    return quotas


# Что даёт каждый тариф. Квоты — из месячного бюджета; пересчитывать при смене
# моделей, прайса провайдеров или цен подписки.
PLAN_LIMITS = {
    Plan.FREE: {
        "label": "Бесплатный",
        "allowed_tiers": {"default", "fast"},
        "allow_web_search": False,
        "allow_memory": False,
        "context_messages": 0,  # без предыстории — каждый вопрос с чистого листа
        "max_attachments": 0,  # вложения недоступны
        "quotas": _plan_quotas(1.6),  # $1.6 / мес — узкий триал «попробовать»
    },
    Plan.PLUS: {
        "label": "Plus",
        "allowed_tiers": _ALL_TIERS,
        "allow_web_search": True,
        "allow_memory": True,
        "context_messages": 10,
        "max_attachments": 5,
        "quotas": _plan_quotas(15.0),  # $15 / мес при цене 1499 ₽
    },
    Plan.PRO: {
        "label": "Pro",
        "allowed_tiers": _ALL_TIERS,
        "allow_web_search": True,
        "allow_memory": True,
        "context_messages": 20,
        "max_attachments": 10,
        "quotas": _plan_quotas(27.0),  # $27 / мес при цене 2499 ₽
    },
}

# Имена режимов для сообщений об исчерпании квоты.
MODE_LABEL = {"chat": "«Общий»", "code": "«Код»", "research": "«Исследовать»"}


def limits_for(plan: str) -> dict:
    """Лимиты тарифа; неизвестный план — Free."""
    return PLAN_LIMITS.get(plan, PLAN_LIMITS[Plan.FREE])


def quota_for(plan: str, mode: str) -> ModeQuota:
    """Квота режима на тарифе; неизвестный режим — консервативно квота chat."""
    quotas = limits_for(plan)["quotas"]
    return quotas.get(mode) or quotas["chat"]
