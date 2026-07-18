"""Пересчёт billable_tokens по существующей истории.

ОБЯЗАТЕЛЕН: без него первое скользящее 7-дневное окно после деплоя увидит нули
и подарит всем пользователям полный сброс квоты. Считаем той же формулой, что и
рантайм (billing.limits.billable_tokens), обновляем пачками.
"""

from django.db import migrations

from apps.billing.limits import billable_tokens


def forwards(apps, schema_editor):
    UsageEvent = apps.get_model("usage", "UsageEvent")
    Usage = apps.get_model("usage", "Usage")

    batch = []
    for ev in UsageEvent.objects.all().iterator():
        ev.billable_tokens = billable_tokens(
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
        row.billable_tokens = billable_tokens(
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
