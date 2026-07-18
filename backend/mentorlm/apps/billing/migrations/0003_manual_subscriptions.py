"""Сохранить выданные вручную тарифы при переходе на Subscription-источник.

Раньше платный тариф можно было выдать правкой UserProfile.plan. Теперь тариф
определяется только подпиской. Для всех, у кого plan != free, но нет живой
подписки, создаём manual-подписку — иначе их тариф схлопнется в Free.
Идёт ДО того, как новый effective_plan вступит в силу в рантайме.
"""

from django.db import migrations


def forwards(apps, schema_editor):
    UserProfile = apps.get_model("users", "UserProfile")
    Subscription = apps.get_model("billing", "Subscription")

    for profile in UserProfile.objects.exclude(plan="free").iterator():
        already = Subscription.objects.filter(
            user=profile, plan=profile.plan, status="active"
        ).exists()
        if already:
            continue
        Subscription.objects.create(
            user=profile,
            plan=profile.plan,
            status="active",
            provider="manual",
            current_period_end=None,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0002_alter_subscription_plan"),
        ("users", "0007_remove_usersettings_interface_lang"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
