"""Учёт расхода ИИ: журнал событий + дневные агрегаты по режимам.

Расход считаем в МИКРО-ДОЛЛАРАХ (µ$) по реальной цене модели. Цены и функция
`usage_cost` — в billing.limits (единственный файл настройки). Поле БД
`billable_tokens` исторически так называется, но хранит µ$.
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
    """Списывает фактический расход: журнал события + дневной агрегат режима.

    Возвращает списанную стоимость в µ$. Квоты читают ТОЛЬКО UsageEvent;
    дневной агрегат Usage — для админки/аналитики. Дневную строку инкрементируем
    атомарно через F(). Вызывается ПОСЛЕ успешного ответа.

    `count_as_request=False` — для СЛУЖЕБНЫХ LLM-вызовов (фоновая память, а в
    будущем — эмбеддинги RAG, генерация заголовка): их расход всё равно списываем
    в квоту режима (это реальные деньги), НО они не считаются отдельным запросом.
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
