"""Учёт расхода ИИ: журнал событий + дневные агрегаты по режимам.

Себестоимость считаем в USD по прайсингу API (за 1M токенов), затем переводим
в рубли по курсу `USD_RUB_RATE`. Рубли — то, чем оперируют тарифные бюджеты
(billing.limits.monthly_cost_rub) и что видит пользователь в ЛК.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.conf import settings
from django.db.models import F

from .models import Usage, UsageEvent

# Ставки себестоимости в USD за 1M токенов (вход/выход) по реальным моделям.
# Ключ — id модели (как в settings.*_MODEL). Неизвестные модели считаем
# бесплатными — расход всё равно виден в токенах. Значения подбираемые: держать
# в соответствии с актуальным прайсингом провайдеров.
MODEL_RATES_USD_PER_1M = {
    "gpt-4o-mini": {"in": Decimal("0.15"), "out": Decimal("0.60")},
    "gpt-4o": {"in": Decimal("2.50"), "out": Decimal("10.0")},
    "gpt-5.5": {"in": Decimal("2.50"), "out": Decimal("10.0")},
    "claude-sonnet-4-6": {"in": Decimal("3.0"), "out": Decimal("15.0")},
    "claude-haiku-4-5": {"in": Decimal("1.0"), "out": Decimal("5.0")},
}


def _usd_rub_rate() -> Decimal:
    """Курс USD→RUB из settings; дефолт заложен в settings.USD_RUB_RATE."""
    return Decimal(str(getattr(settings, "USD_RUB_RATE", 95)))


def cost_of(model: str, tokens_in: int, tokens_out: int) -> tuple[Decimal, Decimal]:
    """Себестоимость запроса → (cost_usd, cost_rub). Неизвестная модель → 0."""
    rates = MODEL_RATES_USD_PER_1M.get(model)
    if not rates:
        return Decimal("0"), Decimal("0")
    usd = (
        rates["in"] * Decimal(tokens_in) + rates["out"] * Decimal(tokens_out)
    ) / Decimal(1_000_000)
    rub = usd * _usd_rub_rate()
    return usd, rub


def record_usage(
    user,
    *,
    mode: str,
    model: str,
    tokens_in: int,
    tokens_out: int,
    scenario: str = "",
    conversation=None,
) -> None:
    """Списывает фактический расход: журнал события + дневной агрегат режима.

    Вызывается ПОСЛЕ успешного ответа — неуспешный запрос не списывается.
    Дневную строку Usage инкрементируем атомарно через F().
    """
    cost_usd, cost_rub = cost_of(model, tokens_in, tokens_out)

    UsageEvent.objects.create(
        user=user,
        conversation=conversation,
        mode=mode,
        scenario=scenario or "",
        model=model,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost_usd=cost_usd,
        cost_rub=cost_rub,
    )

    usage, _ = Usage.objects.get_or_create(user=user, day=date.today(), mode=mode)
    Usage.objects.filter(pk=usage.pk).update(
        request_count=F("request_count") + 1,
        tokens_in=F("tokens_in") + tokens_in,
        tokens_out=F("tokens_out") + tokens_out,
        cost_rub=F("cost_rub") + cost_rub,
    )
