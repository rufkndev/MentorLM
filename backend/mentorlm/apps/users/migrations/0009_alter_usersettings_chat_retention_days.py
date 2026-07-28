"""Срок хранения диалогов по умолчанию: «не удалять» → 30 дней.

Существующим профилям значение 0 досталось от старого дефолта, а не от
осознанного выбора, поэтому переводим их на новый дефолт. Кто хочет хранить
переписку дольше или вечно — меняет срок в настройках («Данные»).
"""

from django.db import migrations, models

OLD_DEFAULT = 0
NEW_DEFAULT = 30


def apply_new_default(apps, schema_editor):
    UserSettings = apps.get_model("users", "UserSettings")
    UserSettings.objects.filter(chat_retention_days=OLD_DEFAULT).update(
        chat_retention_days=NEW_DEFAULT
    )


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_remove_userprofile_plan'),
    ]

    operations = [
        migrations.RunPython(apply_new_default, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='usersettings',
            name='chat_retention_days',
            field=models.PositiveIntegerField(choices=[(0, 'Не удалять'), (30, 'Старше 30 дней'), (90, 'Старше 90 дней'), (180, 'Старше 180 дней')], default=30),
        ),
    ]
