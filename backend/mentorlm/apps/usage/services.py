"""Списание расхода ИИ: событие в журнал плюс инкремент дневного агрегата.

Стоимость считает billing.limits.usage_cost в µ$ — здесь только запись.
"""

from __future__ import annotations

from django.db.models import F
from django.utils import timezone

from apps.billing.limits import usage_cost

from .models import Usage, UsageEvent


def record_usage(
    user,
    *,
    mode: str,
    model: str,
    tokens_in: int,
    tokens_out: int,
    web_search_calls: int = 0,
    scenario: str = "",
    conversation=None,
    count_as_request: bool = True,
    degraded: bool = False,
) -> int:
    """Списать фактический расход после успешного ответа; вернуть стоимость в µ$.

    Квоты читают только `UsageEvent`, дневная строка — для админки, поэтому её
    инкрементируем атомарно через F(). `count_as_request=False` — для служебных
    вызовов (фоновая память): деньги списываем, но запросом пользователя это не
    считаем.
    """
    if not (tokens_in or tokens_out or web_search_calls):
        return 0

    billable = usage_cost(tokens_in, tokens_out, web_search_calls, model=model)

    UsageEvent.objects.create(
        user=user,
        conversation=conversation,
        mode=mode,
        scenario=scenario or "",
        model=model,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        web_search_calls=web_search_calls,
        billable_tokens=billable,
        degraded=degraded,
    )

    usage, _ = Usage.objects.get_or_create(
        user=user, day=timezone.localdate(), mode=mode
    )
    increments = {
        "tokens_in": F("tokens_in") + tokens_in,
        "tokens_out": F("tokens_out") + tokens_out,
        "web_search_calls": F("web_search_calls") + web_search_calls,
        "billable_tokens": F("billable_tokens") + billable,
    }
    if count_as_request:
        increments["request_count"] = F("request_count") + 1
    Usage.objects.filter(pk=usage.pk).update(**increments)
    return billable
