from django.db import models

from apps.conversations.models import Conversation


class Usage(models.Model):
    """Дневные счётчики использования ИИ на пользователя и режим.

    Одна строка на тройку (пользователь, день, режим) — дешёвый агрегат для
    preflight-проверок лимитов: дневной cap сообщений (сумма по режимам),
    суб-лимиты research/code (строка нужного режима) и месячный бюджет
    себестоимости (сумма cost_rub за месяц). Журнал отдельных запросов — в
    `UsageEvent`.
    """

    user = models.ForeignKey(
        "users.UserProfile",
        on_delete=models.CASCADE,
        related_name="usage",
    )
    day = models.DateField()
    mode = models.CharField(
        max_length=20, choices=Conversation.Mode.choices, default=Conversation.Mode.CHAT
    )
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
                fields=["user", "day", "mode"],
                name="unique_usage_per_user_per_day_per_mode",
            ),
        ]
        indexes = [
            # суб-лимит режима за день и месячная сумма по всем режимам
            models.Index(fields=["user", "day", "mode"]),
            models.Index(fields=["user", "day"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.day} [{self.mode}]: {self.request_count} запр."


class UsageEvent(models.Model):
    """Журнал отдельных ИИ-запросов — ledger для админки и аудита стоимости.

    Append-only: одна строка на успешный запрос. Не участвует в горячих
    проверках лимитов (для них есть агрегат `Usage`), но даёт полную картину:
    модель, режим, сценарий, токены и себестоимость в USD и рублях.
    """

    user = models.ForeignKey(
        "users.UserProfile",
        on_delete=models.CASCADE,
        related_name="usage_events",
    )
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="usage_events",
    )
    mode = models.CharField(max_length=20, choices=Conversation.Mode.choices)
    scenario = models.CharField(max_length=50, blank=True)
    model = models.CharField(max_length=50, blank=True)
    tokens_in = models.PositiveIntegerField(default=0)
    tokens_out = models.PositiveIntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    cost_rub = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Событие расхода ИИ"
        verbose_name_plural = "События расхода ИИ"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["user", "mode", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.model} [{self.mode}]: {self.cost_rub}₽"
