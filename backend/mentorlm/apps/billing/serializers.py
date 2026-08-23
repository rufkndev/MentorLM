"""Сериализаторы биллинга: что фронт присылает и что видит в ответ."""

from __future__ import annotations

from rest_framework import serializers

from .models import Payment, Plan


class CheckoutSerializer(serializers.Serializer):
    """Запрос на оформление подписки.

    Три поля, и каждое несёт юридический смысл, а не только технический:

    * `plan` — что покупаем;
    * `auto_renew` — согласие на автосписания. По умолчанию False: согласие
      должно быть выраженным, поэтому «не прислали поле» означает «не согласен»,
      а не «как обычно» (ст. 16 ЗоЗПП запрещает предпроставленные согласия);
    * `accept_offer` — акцепт оферты. Обязан быть True: по п. 4.1 договор
      заключается нажатием кнопки оплаты под сформированным заказом, и без
      подтверждения принятия условий заказ оформлять нельзя.
    """

    plan = serializers.ChoiceField(choices=[Plan.PLUS, Plan.PRO])
    auto_renew = serializers.BooleanField(default=False)
    accept_offer = serializers.BooleanField()

    def validate_accept_offer(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError(
                "Оформление возможно только после принятия оферты и политики "
                "конфиденциальности."
            )
        return value


class PaymentSerializer(serializers.ModelSerializer):
    """Операция для истории платежей в личном кабинете.

    Наружу отдаём только то, что человеку осмысленно видеть. `external_id`
    включён намеренно: с ним обращение в поддержку или в банк решается за один
    заход, без него — перепиской «а какой именно платёж».
    """

    plan_label = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    refunded = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id",
            "plan",
            "plan_label",
            "kind",
            "kind_label",
            "status",
            "status_label",
            "amount",
            "currency",
            "description",
            "external_id",
            "card_last4",
            "card_type",
            "period_start",
            "period_end",
            "refunded",
            "refunded_amount",
            # Ссылка на чек в сервисе ФНС. Пусто у оплаченного платежа = чек
            # ещё выписывают; ЛК в этом случае так и пишет, а не молчит.
            "npd_receipt_url",
            "created_at",
            "paid_at",
        )
        read_only_fields = fields

    def get_plan_label(self, obj: Payment) -> str:
        from .limits import limits_for

        return limits_for(obj.plan)["label"]

    def get_refunded(self, obj: Payment) -> bool:
        return obj.refunded_amount > 0


class CheckoutResultSerializer(serializers.Serializer):
    """Ответ на оформление: куда отправить человека платить."""

    payment_id = serializers.IntegerField()
    confirmation_url = serializers.URLField()
