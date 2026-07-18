"""Расчётные токены: новые поля billable_tokens / web_search_calls.

Только добавление полей с дефолтами — обратимо, старый код продолжает работать.
Денежные поля (cost_usd/cost_rub) удаляются позже (0005), уже после того как код
перестанет их писать, а 0004 перенесёт историю в billable_tokens.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("usage", "0002_usageevent_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="usage",
            name="web_search_calls",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="usage",
            name="billable_tokens",
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="usageevent",
            name="web_search_calls",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="usageevent",
            name="billable_tokens",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
