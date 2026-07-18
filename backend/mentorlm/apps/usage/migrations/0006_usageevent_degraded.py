"""Флаг деградации на событии расхода — запрос на дешёвой модели после исчерпания
квоты (см. billing.guard). По нему guard считает выданные grace-запросы."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("usage", "0005_drop_money"),
    ]

    operations = [
        migrations.AddField(
            model_name="usageevent",
            name="degraded",
            field=models.BooleanField(default=False),
        ),
    ]
