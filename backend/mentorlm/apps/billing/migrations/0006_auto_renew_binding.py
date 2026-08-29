"""Честное состояние привязки платёжного средства.

Три поля появляются из одного факта: согласие на автосписания и техническая
возможность списать — разные вещи. Раньше их путали, и подписка, оплаченная
способом без привязки, показывала «продлевается автоматически», хотя списать
было нечем.

* `Subscription.auto_renew_requested` — согласие дано. Остаётся True, даже если
  привязка не удалась: именно по нему ЛК объясняет человеку, почему обещанного
  автопродления нет.
* `Subscription.payment_method_type` / `Payment.payment_method_type` — чем
  заплатили (bank_card, sbp, …). Без него не отличить «карта привязана» от
  «заплатили через СБП», и приходилось называть картой что попало.
* `Subscription.expiry_notified_at` — отметка об отправке письма «подписка
  заканчивается» для подписок без автопродления. Зеркало renewal_notified_at.

Данные не переносим: у существующих подписок `auto_renew_requested` False —
это верно для всех, у кого автопродления нет, а у кого оно есть, поле
выставится при ближайшем продлении. Ошибиться в другую сторону (проставить
True всем подряд) было бы хуже: ЛК начал бы объяснять несуществующую проблему.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0005_npd_receipts"),
    ]

    operations = [
        migrations.AddField(
            model_name="subscription",
            name="auto_renew_requested",
            field=models.BooleanField(
                default=False, verbose_name="Запрошено автопродление"
            ),
        ),
        migrations.AddField(
            model_name="subscription",
            name="payment_method_type",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name="subscription",
            name="expiry_notified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="payment",
            name="payment_method_type",
            field=models.CharField(blank=True, max_length=32),
        ),
        # У всех, у кого автопродление реально работает, согласие очевидно есть
        # — приводим поле в соответствие, чтобы ЛК не считал их «без согласия».
        migrations.RunSQL(
            sql=(
                "UPDATE billing_subscription "
                "SET auto_renew_requested = true WHERE auto_renew = true;"
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
