"""Учёт расхода ИИ. Записываем потребление, но пока не блокируем по лимиту."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db.models import F

from .models import Usage

# Ставки в рублях за 1000 токенов (грубо, для оценки стоимости в ЛК).
# Неизвестные модели считаем бесплатными — расход всё равно виден в токенах.
MODEL_RATES_RUB_PER_1K = {
    "gpt-4o-mini": {"in": Decimal("0.015"), "out": Decimal("0.06")},
    "gpt-4o": {"in": Decimal("0.25"), "out": Decimal("1.0")},
    # Claude Sonnet 4.6 — режим «Код» ($3/$15 за 1M ≈ ₽/1K при курсе ~90).
    "claude-sonnet-4-6": {"in": Decimal("0.27"), "out": Decimal("1.35")},
}


def _cost_rub(model: str, tokens_in: int, tokens_out: int) -> Decimal:
    rates = MODEL_RATES_RUB_PER_1K.get(model)
    if not rates:
        return Decimal("0")
    return (
        rates["in"] * Decimal(tokens_in) + rates["out"] * Decimal(tokens_out)
    ) / Decimal(1000)


def record_usage(user, *, tokens_in: int, tokens_out: int, model: str) -> None:
    """Инкрементирует дневную строку Usage пользователя (атомарно через F())."""
    cost = _cost_rub(model, tokens_in, tokens_out)
    usage, created = Usage.objects.get_or_create(user=user, day=date.today())
    Usage.objects.filter(pk=usage.pk).update(
        request_count=F("request_count") + 1,
        tokens_in=F("tokens_in") + tokens_in,
        tokens_out=F("tokens_out") + tokens_out,
        cost_rub=F("cost_rub") + cost,
    )
