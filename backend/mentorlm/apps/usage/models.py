from django.db import models


class Usage(models.Model):
    """Дневные счётчики использования ИИ на пользователя.

    Одна строка на пару (пользователь, день). Используется для проверки
    тарифных лимитов перед AI-вызовом и для лога стоимости.
    """

    user = models.ForeignKey(
        "users.UserProfile",
        on_delete=models.CASCADE,
        related_name="usage",
    )
    day = models.DateField()
    request_count = models.PositiveIntegerField(default=0)
    tokens_in = models.PositiveIntegerField(default=0)
    tokens_out = models.PositiveIntegerField(default=0)
    cost_rub = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Использование"
        verbose_name_plural = "Использование"
        ordering = ("-day",)
        constraints = [
            models.UniqueConstraint(
                fields=["user", "day"],
                name="unique_usage_per_user_per_day",
            ),
        ]
        indexes = [
            # быстрый поиск дневной строки конкретного пользователя
            models.Index(fields=["user", "day"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.day}: {self.request_count} запр."
