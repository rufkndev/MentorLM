"""Удаление денежных полей: расход теперь только в расчётных токенах.

Идёт последней — код уже не читает cost_usd/cost_rub, а 0004 перенёс историю
в billable_tokens.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("usage", "0004_backfill_billable"),
    ]

    operations = [
        migrations.RemoveField(model_name="usage", name="cost_rub"),
        migrations.RemoveField(model_name="usageevent", name="cost_usd"),
        migrations.RemoveField(model_name="usageevent", name="cost_rub"),
    ]
