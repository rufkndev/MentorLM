"""Модели, тарифы, цены и лимиты — единственный файл настройки экономики.

Все числа, которые крутят при её настройке, живут здесь: какие модели зовём,
сколько они стоят, что даёт каждый тариф. guard, record_usage и ai-слой только
читают их отсюда — id моделей в env больше нет, потому что модель и её цена это
один факт, а разнесённые по разным местам они расходились молча.

Согласованность каталога (у каждой модели режима есть цена, режимы описаны во
всех словарях, тиры совпадают с UI) проверяется на старте — `checks.py`.

Единица расхода — МИКРО-ДОЛЛАР ($·1e-6), целыми числами (float копил бы ошибку
при суммировании ledger'а):

    cost_µ$ = tokens_in * price_in + tokens_out * price_out
            + web_search_calls * WEB_SEARCH_CALL_COST

Цена в $/1M токенов численно равна µ$ за токен, поэтому формула сразу даёт µ$.
Квоты авторуются в долларах и переводятся в те же µ$ (`_plan_quotas`).
"""

from __future__ import annotations

import calendar
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import NamedTuple

from .models import Plan


# ── Каталог моделей ───────────────────────────────────────────────────────────


class ModelPrice(NamedTuple):
    """Цена модели в $/1M токенов. NamedTuple — распаковывается как кортеж."""

    input: float
    output: float


# Каждая модель, которую система может вызвать. Добавить модель = одна строка.
# ⚠️ Сверять с прайсом провайдеров. Модели, которой здесь нет, не может быть в
# MODES: это ломает старт (checks.py), а не считается молча по DEFAULT_PRICE.
MODELS: dict[str, ModelPrice] = {
    # OpenAI — режимы «Общий» и «Исследовать» (сверено с прайсом, август 2026)
    "gpt-5.6-sol": ModelPrice(5.00, 30.00),
    "gpt-5.6-terra": ModelPrice(2.00, 12.00),
    "gpt-5.6-luna": ModelPrice(0.20, 1.20),
    "gpt-5-nano": ModelPrice(0.05, 0.40),
    # Anthropic — режим «Код»
    "claude-opus-5": ModelPrice(5.00, 25.00),
    "claude-sonnet-5": ModelPrice(3.00, 15.00),
    "claude-haiku-4-5": ModelPrice(1.00, 5.00),
}

# Цена для модели, которой в каталоге уже нет: в ledger'е остаются события,
# записанные до того, как модель убрали. Держать не ниже самой дорогой строки
# MODELS — иначе «неизвестная модель» окажется выгоднее известных.
DEFAULT_PRICE = ModelPrice(5.00, 30.00)

# Продуктовые тиры настройки «Модель ИИ»; подписи — ai.preferences.MODEL_TIER_CHOICES.
TIERS = ("default", "fast", "quality")
_ALL_TIERS = set(TIERS)


@dataclass(frozen=True)
class ModeModels:
    """Чем отвечает режим: провайдер, модель на каждый тир и модель деградации."""

    provider: str  # "openai_chat" | "anthropic" | "openai_research"
    tier_field: str  # поле UserSettings, где лежит выбранный тир
    default: str  # тир «Стандартная» — он же модель режима по умолчанию
    fast: str  # тир «Быстрая»
    quality: str  # тир «Максимальная»
    degrade: str  # дешёвая модель при исчерпанной квоте (guard → ai.service)
    web_search: bool = False

    def model(self, tier: str) -> str:
        """Модель тира; неизвестный тир — стандартная."""
        return getattr(self, tier, "") if tier in _ALL_TIERS else self.default


# Что зовёт каждый режим. Поменять модель режима или тира = одна строка здесь.
MODES: dict[str, ModeModels] = {
    "chat": ModeModels(
        provider="openai_chat",
        tier_field="chat_model",
        default="gpt-5.6-terra",
        fast="gpt-5.6-luna",
        quality="gpt-5.6-sol",
        degrade="gpt-5-nano",
    ),
    "code": ModeModels(
        provider="anthropic",
        tier_field="code_model",
        default="claude-sonnet-5",
        fast="claude-haiku-4-5",
        quality="claude-opus-5",
        degrade="claude-haiku-4-5",
    ),
    "research": ModeModels(
        provider="openai_research",
        tier_field="research_model",
        default="gpt-5.6-terra",
        fast="gpt-5.6-luna",
        quality="gpt-5.6-sol",
        degrade="gpt-5-nano",
        web_search=True,
    ),
}

# Дешёвая модель фонового извлечения фактов памяти (apps.memory.services).
MEMORY_MODEL = "gpt-5-nano"


def mode_models(mode: str) -> ModeModels:
    """Модели режима; неизвестный режим — консервативно «Общий»."""
    return MODES.get(mode) or MODES["chat"]


def model_for(mode: str, tier: str) -> str:
    """Реальный id модели по режиму и продуктовому тиру."""
    return mode_models(mode).model(tier)


def referenced_models() -> set[str]:
    """Все модели, на которые ссылается конфигурация, — вход для checks.py."""
    used = {MEMORY_MODEL}
    for cfg in MODES.values():
        used.update({cfg.default, cfg.fast, cfg.quality, cfg.degrade})
    return used


# ── Стоимость запроса ─────────────────────────────────────────────────────────
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
    price_in, price_out = MODELS.get(model, DEFAULT_PRICE)
    token_cost = tokens_in * price_in + tokens_out * price_out
    return round(token_cost) + web_search_calls * WEB_SEARCH_CALL_COST


# ── Глобальные потолки-предохранители (едины для всех тарифов) ────────────────
RATE_PER_MIN = 5  # запросов в минуту, анти-спам (общий кэш — settings.CACHES)
MAX_OUTPUT_TOKENS = 30_000  # потолок ответа — обрез на уровне провайдера
MAX_INPUT_TOKENS = 100_000  # потолок ввода — reject до вызова модели
# Потолок сообщения в СИМВОЛАХ: грубый предохранитель перед MAX_INPUT_TOKENS,
# чтобы не запускать tiktoken по мегабайтному телу только ради отказа. Взят с
# запасом над потолком токенов — отказ по длине должен приходить из одного
# места, а не зависеть от того, на каком языке написано сообщение.
MAX_MESSAGE_CHARS = 400_000
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
# «Код» ниже остальных: там деградация почти не удешевляет ответ — самая дешёвая
# модель Anthropic (Haiku) дороже дешёвых OpenAI-моделей на порядок, и грейс
# приходится ограничивать числом запросов, а не ценой.
DEGRADE_REQUESTS = {"chat": 5, "code": 2, "research": 5}
DEFAULT_DEGRADE_REQUESTS = 5


def degrade_requests(mode: str) -> int:
    """Сколько ответов на дешёвой модели даёт режим после исчерпания квоты."""
    return DEGRADE_REQUESTS.get(mode, DEFAULT_DEGRADE_REQUESTS)


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


# ── Деньги: цены подписки и правила продления ─────────────────────────────────
# Всё выше считает себестоимость в µ$; ниже — то, что платит пользователь.
#
# ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ЗАДАНА ЦЕНА ПОДПИСКИ. Фронт цены не хранит —
# забирает их с /api/billing/plans/ (см. usePlanPrices). Значения в
# billing-contents.ts — только запасные, на случай недоступного API.
#
# Для проверки оплаты на деве удобно поставить копеечную сумму, не трогая код:
#     PLAN_PRICE_PLUS=10
#     PLAN_PRICE_PRO=20
# в infra/env/.env — и перезапустить бэкенд. ⚠️ Минимум ЮKassa — 1 ₽.
PLAN_PRICE_RUB: dict[str, int] = {
    Plan.FREE: 0,
    Plan.PLUS: int(os.environ.get("PLAN_PRICE_PLUS") or 1499),
    Plan.PRO: int(os.environ.get("PLAN_PRICE_PRO") or 2499),
}

# Расчётный период — календарный месяц (оферта 5.2).
RENEWAL_NOTICE_HOURS = 24  # уведомление о списании, ФЗ-376 / оферта 7.3
RENEWAL_MAX_ATTEMPTS = 3  # попыток списания подряд, дальше — на Free (7.8)

# Курс для перевода себестоимости (UsageEvent в µ$) в рубли при расчёте
# возврата «за вычетом фактически понесённых расходов» (оферта 11.2). Не
# биржевой курс, а осознанно завышенная оценка: занизить её значило бы вернуть
# больше, чем следует, и оспорить это уже нечем.
USD_RUB_RATE = 95.0


def plan_price(plan: str) -> int:
    """Цена тарифа в рублях за расчётный период; неизвестный тариф — 0."""
    return PLAN_PRICE_RUB.get(plan, 0)


def add_billing_month(moment: datetime) -> datetime:
    """Прибавить один расчётный период (календарный месяц).

    `dateutil` в зависимостях нет, а наивное «+30 дней» уводит дату списания
    по кругу и через полгода расходится с тем, что человек видел в письме.
    Хвостовые числа подрезаются по длине месяца: 31 января → 28/29 февраля.
    """
    year = moment.year + (moment.month // 12)
    month = moment.month % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


# ── Налоговый режим и чеки ────────────────────────────────────────────────────
# Исполнитель — ИП на НПД (налог на профессиональный доход, ФЗ-422). Отсюда две
# вещи, которые нельзя перепутать:
#
# 1. **ККТ не применяется** — п. 2.2 ст. 2 ФЗ-54 прямо освобождает плательщиков
#    НПД. Значит модуль чеков ЮKassa (он весь про 54-ФЗ и онлайн-кассу) нам не
#    подходит, и блок `receipt` в платёж НЕ отправляется. Отправить его при
#    неподключённой кассе — получить ошибку от провайдера.
# 2. **Чек всё равно обязателен**, но другой: ч. 1 ст. 14 ФЗ-422 требует
#    сформировать чек в приложении «Мой налог» и передать покупателю. Для
#    безналичных расчётов срок — не позднее 9-го числа месяца, следующего за
#    месяцем расчёта (ч. 3 ст. 14). Автоматизировать это без партнёрского
#    доступа к API ФНС нельзя, поэтому чек выписывается вручную, а система
#    ведёт список должников и напоминает о сроке (billing_tick, админка).
#
# Если однажды перейдёте на УСН/ОСН и подключите кассу — меняется одна строка
# ниже, и блок receipt снова начнёт уходить в ЮKassa с параметрами из RECEIPT_*.
#
# ⚠️ Модуль чеков в кабинете ЮKassa должен быть ВЫКЛЮЧЕН. Если он включён,
# провайдер требует блок `receipt` в каждом платеже и отвечает
# «Receipt is missing or illegal» — а мы его на НПД не отправляем и не должны.
TAX_MODE = "npd"  # "npd" — ИП на НПД (ФЗ-422); "kkt" — с онлайн-кассой (54-ФЗ)
USE_KKT_RECEIPTS = TAX_MODE == "kkt"

# До какого числа следующего месяца нужно выдать чек НПД по безналу (ФЗ-422).
NPD_RECEIPT_DEADLINE_DAY = 9
# За сколько дней до срока начинать напоминать в логах планировщика.
NPD_RECEIPT_WARN_DAYS = 3

# Параметры чека по 54-ФЗ. Сейчас не используются (TAX_MODE = "npd"), но
# оставлены рабочими: при подключении кассы менять их придётся здесь.
RECEIPT_VAT_CODE = 1  # «Без НДС»
# Система налогообложения. None — не отправляем, и ЮKassa берёт настройку
# магазина; это безопасный вариант по умолчанию. Указывать значение (2 — УСН
# доход) нужно только если у магазина настроено несколько систем сразу:
# несовпадающий код провайдер отвергает наравне с отсутствующим чеком.
RECEIPT_TAX_SYSTEM_CODE: int | None = None
RECEIPT_PAYMENT_SUBJECT = "service"  # предмет расчёта — услуга
# «Полный расчёт», а не «полная предоплата»: доступ к тарифу открывается в
# момент оплаты (оферта 6.6), то есть расчёт совпадает с началом оказания
# услуги. full_prepayment потребовал бы ещё и закрывающий чек в зачёт аванса в
# конце каждого периода — отдельный поток чеков без выгоды для пользователя.
RECEIPT_PAYMENT_MODE = "full_payment"
RECEIPT_MEASURE = "piece"


def npd_receipt_deadline(paid_at: datetime) -> datetime:
    """Крайний срок выдачи чека НПД по платежу (ч. 3 ст. 14 ФЗ-422).

    Не позднее 9-го числа месяца, следующего за месяцем расчёта.
    """
    year = paid_at.year + (paid_at.month // 12)
    month = paid_at.month % 12 + 1
    return paid_at.replace(
        year=year,
        month=month,
        day=NPD_RECEIPT_DEADLINE_DAY,
        hour=23,
        minute=59,
        second=59,
        microsecond=0,
    )


def limits_for(plan: str) -> dict:
    """Лимиты тарифа; неизвестный план — Free."""
    return PLAN_LIMITS.get(plan, PLAN_LIMITS[Plan.FREE])


def quota_for(plan: str, mode: str) -> ModeQuota:
    """Квота режима на тарифе; неизвестный режим — консервативно квота chat."""
    quotas = limits_for(plan)["quotas"]
    return quotas.get(mode) or quotas["chat"]
