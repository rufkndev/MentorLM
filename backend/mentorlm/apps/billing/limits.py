"""Тарифные лимиты — ЕДИНСТВЕННЫЙ файл настройки тарифов и стоимости.

Все числа, которые крутят при настройке экономики, живут здесь: цены моделей,
глобальные потолки-предохранители, скользящие окна и квоты по тарифам.
`record_usage` и `guard` читают их отсюда — больше нигде цифр нет.

Расход измеряется в МИКРО-ДОЛЛАРАХ ($·1e-6), напрямую из реальной цены модели:

    cost_µ$ = tokens_in * price_in + tokens_out * price_out
            + web_search_calls * WEB_SEARCH_CALL_COST

Цены в `MODEL_PRICES` заданы в $/1M токенов — численно это ровно µ$ за токен,
поэтому формула выше сразу даёт µ$ без деления. µ$ (а не доллары-float) — чтобы
суммировать расход по ledger'у без накопления ошибки округления. Квоты тарифов
авторуются в ДОЛЛАРАХ и переводятся в те же µ$ (см. `_plan_quotas`), так что
сравниваем одну единицу с одной. Добавить/сменить модель = одна строка
`(вход, выход)` в `MODEL_PRICES`.

Квоты — по режимам (chat/code/research), у каждого свой пул. На каждый режим два
СКОЛЬЗЯЩИХ окна: 5 часов (анти-берст) и 7 дней (главный предохранитель бизнеса).
Считаются как SUM(billable_tokens) по UsageEvent за `now - окно`. Числа выведены
из МЕСЯЧНОГО потолка на тариф (Free $1.6, Plus $15, Pro $27): месяц раскидывается
по режимам (chat 5/12, code 4/12, research 3/12), затем делится на окна —
НЕДЕЛЯ = месяц / 4 (главный потолок), 5ч-окно = BURST_SHARE_OF_WEEK от недельной
(разрешённый всплеск, по умолч. 25%). Пересчитывать при смене моделей/прайса/цен
тарифов.

Пер-тарифных лимитов ввода/вывода и контекста в токенах НЕТ — они заменены
едиными глобальными потолками-предохранителями (см. ниже). Контекст меряется
только числом сообщений (`context_messages` тарифа, потолок MAX_CONTEXT_MESSAGES).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from apps.users.models import UserProfile

# Все продуктовые тиры моделей (см. ai/preferences.MODEL_TIER_CHOICES).
_ALL_TIERS = {"default", "fast", "quality"}


# ── Цены моделей ─────────────────────────────────────────────────────────────
# Цена в $/1M токенов = µ$/токен. Ключ — реальный id модели (см. settings/env и
# ai.registry/preferences). Добавить модель = одна строка (вход, выход).
# ⚠️ Выходные цены СВЕРИТЬ с реальным прайсом провайдеров.
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
# Неизвестная/новая модель → консервативно как флагман (не 0: без дыры
# «неизвестная модель = бесплатно»).
DEFAULT_PRICE = (5.00, 15.00)

# Плоская плата за один вызов веб-поиска OpenAI ($0.01 = 10_000 µ$), отдельно от
# токенов — это цена инструмента, не токенов.
WEB_SEARCH_CALL_COST = 10_000

# Сколько поисков модель может сделать в ОДНОМ ответе. Без потолка «дотошный»
# ответ мог уйти в десятки поисков и в одиночку съесть недельную квоту режима:
# 8 вызовов = $0.08 сверх токенов. Отдаём его провайдеру как max_tool_calls, а
# если модель/API его не примет — режем на своей стороне (см. openai_research).
WEB_SEARCH_CALLS_PER_ANSWER = 8


def usage_cost(
    tokens_in: int,
    tokens_out: int,
    web_search_calls: int = 0,
    *,
    model: str = "",
) -> int:
    """Себестоимость запроса в µ$ (единица квот).

    Токен-часть — по цене модели (вход/выход раздельно); плоская плата за
    веб-поиск сверху. Пустой/неизвестный `model` → консервативный дефолт-прайс.
    """
    price_in, price_out = MODEL_PRICES.get(model, DEFAULT_PRICE)
    token_cost = tokens_in * price_in + tokens_out * price_out
    return round(token_cost) + web_search_calls * WEB_SEARCH_CALL_COST


# ── Глобальные потолки-предохранители (едины для всех тарифов) ────────────────
RATE_PER_MIN = 5  # запросов в минуту, анти-спам (нужен общий Redis в проде)
MAX_OUTPUT_TOKENS = 30_000  # потолок ответа — обрез на уровне провайдера
MAX_INPUT_TOKENS = 100_000  # потолок ввода — reject до вызова модели
MAX_CONTEXT_MESSAGES = 30  # абсолютный потолок длины истории

# Wall-clock таймаут генерации — по режимам, потому что их «нормальная» длина
# отличается на порядок. «Исследовать» с веб-поиском может молчать минутами:
# модель ходит по сайтам и рассуждает, текст в это время не идёт. Общие 180 с
# обрывали такие ответы ошибкой посреди работы. Проверяется между дельтами.
REQUEST_TIMEOUT_SECONDS = {"chat": 180, "code": 300, "research": 900}
DEFAULT_REQUEST_TIMEOUT_SECONDS = 180


def request_timeout(mode: str) -> int:
    """Потолок времени генерации для режима (секунды)."""
    return REQUEST_TIMEOUT_SECONDS.get(mode, DEFAULT_REQUEST_TIMEOUT_SECONDS)


# Самый долгий возможный ответ — по нему выставляется TTL лока генерации.
MAX_REQUEST_TIMEOUT_SECONDS = max(REQUEST_TIMEOUT_SECONDS.values())

# Скользящие окна квоты: ключ → (длительность, человекочитаемое имя).
QUOTA_WINDOWS: dict[str, tuple[timedelta, str]] = {
    "burst": (timedelta(hours=5), "5 часов"),
    "week": (timedelta(days=7), "7 дней"),
}

# Деградация: когда квота режима исчерпана, вместо жёсткого блока даём столько
# запросов на дешёвой модели (см. registry.degrade_model), затем — полный блок до
# восстановления окна. Считается по исчерпанному окну, поэтому «отпускает» вместе
# с ним. Едина для всех тарифов.
DEGRADE_REQUESTS = 5


@dataclass(frozen=True)
class ModeQuota:
    """Квота режима в µ$ на каждое скользящее окно.

    None — безлимит (окно не проверяется); 0 — режим недоступен на тарифе.
    """

    burst: int | None
    week: int | None

    def limit(self, window: str) -> int | None:
        return getattr(self, window)


# $1 = 1_000_000 µ$. Квоты авторуются в ДОЛЛАРАХ (месячный бюджет тарифа), внутри
# хранятся в целых µ$ — так же, как расход из usage_cost, чтобы сравнивать одно с
# одним без накопления ошибки float.
_MICRO = 1_000_000

# Доли режимов в месячном бюджете тарифа (сумма = 1).
_MODE_SHARES = {"chat": 5 / 12, "code": 4 / 12, "research": 3 / 12}

# Доля недельной квоты, доступная в одном 5ч-окне (разрешённый всплеск). Время-
# пропорционально это было бы 5/168 ≈ 0.03 — полный запрет всплесков, ~1 ответ за
# 5ч; поднято до 25%, чтобы прошла нормальная учебная сессия. НЕДЕЛЮ это НЕ меняет
# — она держит общий потолок. Крутить тут, если всплески нужны больше/меньше.
BURST_SHARE_OF_WEEK = 0.25


def _plan_quotas(monthly_usd: float) -> dict[str, ModeQuota]:
    """Раскидать МЕСЯЧНЫЙ бюджет тарифа ($) по режимам и окнам, вернуть µ$.

    Месяц → режим (доля) → НЕДЕЛЯ = месяц / 4 → 5ч-окно = BURST_SHARE_OF_WEEK от
    недельной квоты. Неделя — главный потолок; 5ч-окно лишь ограничивает, как
    быстро можно её выбрать (анти-берст), но разрешает сессию.
    """
    quotas: dict[str, ModeQuota] = {}
    for mode, share in _MODE_SHARES.items():
        week = round(monthly_usd * share / 4 * _MICRO)
        quotas[mode] = ModeQuota(burst=round(week * BURST_SHARE_OF_WEEK), week=week)
    return quotas


PLAN_LIMITS = {
    UserProfile.Plan.FREE: {
        "label": "Бесплатный",
        "allowed_tiers": {"default", "fast"},
        "allow_web_search": False,
        "allow_memory": False,
        "context_messages": 0,  # каждое сообщение — с чистого листа
        "max_attachments": 0,  # вложения недоступны
        # Free — узкий триал «попробовать».
        "quotas": _plan_quotas(1.6),  # $1.6 / мес
    },
    UserProfile.Plan.PLUS: {
        "label": "Plus",
        "allowed_tiers": _ALL_TIERS,
        "allow_web_search": True,
        "allow_memory": True,
        "context_messages": 10,
        "max_attachments": 5,
        # Plus 1499 ₽.
        "quotas": _plan_quotas(15.0),  # $15 / мес
    },
    UserProfile.Plan.PRO: {
        "label": "Pro",
        "allowed_tiers": _ALL_TIERS,
        "allow_web_search": True,
        "allow_memory": True,
        "context_messages": 20,
        "max_attachments": 10,
        # Pro 2499 ₽.
        "quotas": _plan_quotas(27.0),  # $27 / мес
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
