"""Пересчёт billable_tokens по существующей истории.

ОБЯЗАТЕЛЕН: без него первое скользящее 7-дневное окно после деплоя увидит нули
и подарит всем пользователям полный сброс квоты. Обновляем пачками.

Формула ЗАМОРОЖЕНА в самой миграции (не импортируем billing.limits): миграции
должны быть самодостаточны и не ломаться при переименовании рантайм-кода. На
момент этой миграции billable считался как (in + 6*out) * 5.0 + web * 10_000
(model не передавался → дефолтный множитель стоимости 5.0).
"""

from django.db import migrations

# Замороженные константы формулы на момент миграции (см. docstring).
_OUTPUT_WEIGHT = 6
_DEFAULT_COST_FACTOR = 5.0
_WEB_SEARCH_CALL_TOKENS = 10_000


def _billable(tokens_in, tokens_out, web_search_calls):
    token_cost = (tokens_in + tokens_out * _OUTPUT_WEIGHT) * _DEFAULT_COST_FACTOR
    return round(token_cost) + web_search_calls * _WEB_SEARCH_CALL_TOKENS


def forwards(apps, schema_editor):
    UsageEvent = apps.get_model("usage", "UsageEvent")
    Usage = apps.get_model("usage", "Usage")

    batch = []
    for ev in UsageEvent.objects.all().iterator():
        ev.billable_tokens = _billable(
            ev.tokens_in, ev.tokens_out, ev.web_search_calls
        )
        batch.append(ev)
        if len(batch) >= 2000:
            UsageEvent.objects.bulk_update(batch, ["billable_tokens"])
            batch.clear()
    if batch:
        UsageEvent.objects.bulk_update(batch, ["billable_tokens"])

    batch = []
    for row in Usage.objects.all().iterator():
        row.billable_tokens = _billable(
            row.tokens_in, row.tokens_out, row.web_search_calls
        )
        batch.append(row)
        if len(batch) >= 2000:
            Usage.objects.bulk_update(batch, ["billable_tokens"])
            batch.clear()
    if batch:
        Usage.objects.bulk_update(batch, ["billable_tokens"])


class Migration(migrations.Migration):

    dependencies = [
        ("usage", "0003_billable_tokens"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
