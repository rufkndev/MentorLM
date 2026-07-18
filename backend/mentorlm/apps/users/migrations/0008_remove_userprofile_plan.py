"""Убираем кэш-поле UserProfile.plan: тариф считается на лету из подписок.

Зависим от billing.0003_manual_subscriptions — та миграция читает plan, чтобы
перенести выданные вручную тарифы в Subscription, поэтому должна отработать ДО
удаления поля.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0007_remove_usersettings_interface_lang"),
        ("billing", "0003_manual_subscriptions"),
    ]

    operations = [
        migrations.RemoveIndex(model_name="userprofile", name="users_userp_plan_12e6de_idx"),
        migrations.RemoveField(model_name="userprofile", name="plan"),
    ]
