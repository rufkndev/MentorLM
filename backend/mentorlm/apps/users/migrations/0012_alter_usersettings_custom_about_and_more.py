"""Потолки длины на свободные поля «о себе».

Эти поля уходят в системный промпт на каждом запросе (ai.preferences._persona),
а `learning_goals`, `custom_about` и `custom_style` до сих пор были безразмерными
`TextField` — то есть и вектором инъекции, и способом раздуть счёт за токены.

Перед сменой типа обрезаем то, что уже лежит в базе: у CharField Postgres
откажется сужать varchar, если хоть одна строка длиннее нового предела, и
миграция упала бы на проде. TextField такого не требует, но оставлять в базе
значения, которые API больше не примет, тоже незачем.
"""

from django.db import migrations, models
from django.db.models.functions import Left, Length

# Копия apps.ai.preferences.PERSONA_LIMITS на момент миграции: код меняется,
# а уже применённая миграция должна остаться воспроизводимой.
LIMITS = {
    "nickname": 50,
    "occupation": 100,
    "field_of_study": 120,
    "learning_goals": 600,
    "custom_about": 1500,
    "custom_style": 1000,
}


def truncate_long_values(apps, schema_editor):
    UserSettings = apps.get_model("users", "UserSettings")
    for name, limit in LIMITS.items():
        (
            UserSettings.objects.annotate(_len=Length(name))
            .filter(_len__gt=limit)
            .update(**{name: Left(name, limit)})
        )


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0011_emailtoken'),
    ]

    operations = [
        migrations.RunPython(truncate_long_values, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='usersettings',
            name='custom_about',
            field=models.TextField(blank=True, max_length=1500),
        ),
        migrations.AlterField(
            model_name='usersettings',
            name='custom_style',
            field=models.TextField(blank=True, max_length=1000),
        ),
        migrations.AlterField(
            model_name='usersettings',
            name='field_of_study',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AlterField(
            model_name='usersettings',
            name='learning_goals',
            field=models.TextField(blank=True, max_length=600),
        ),
        migrations.AlterField(
            model_name='usersettings',
            name='nickname',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AlterField(
            model_name='usersettings',
            name='occupation',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
