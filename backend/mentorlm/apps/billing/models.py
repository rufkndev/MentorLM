from django.db import models


class Subscription(models.Model):
    """Подписка пользователя. ЕДИНСТВЕННЫЙ источник правды о тарифе и его статусе.

    Тариф пользователя = план живой подписки (billing.plans.effective_plan);
    отдельного кэша в профиле нет. Провайдер оплаты — YooKassa.
    """

    class Plan(models.TextChoices):
        FREE = "free", "Бесплатный"
        PLUS = "plus", "Plus"
        PRO = "pro", "Pro"

    class Status(models.TextChoices):
        PENDING = "pending", "Ожидает оплаты"
        ACTIVE = "active", "Активна"
        PAST_DUE = "past_due", "Просрочена"
        CANCELED = "canceled", "Отменена"

    user = models.ForeignKey(
        "users.UserProfile",
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )
    plan = models.CharField(max_length=20, choices=Plan.choices)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    provider = models.CharField(max_length=30, default="yookassa")
    external_id = models.CharField(max_length=255, blank=True, db_index=True)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Подписка"
        verbose_name_plural = "Подписки"
        ordering = ("-created_at",)
        indexes = [
            # активная подписка пользователя
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.get_plan_display()} ({self.get_status_display()})"
