"""Хранилище расхода ИИ: журнал запросов для квот и дневной роллап для аналитики."""

from django.db import models

from apps.conversations.models import Conversation


class Usage(models.Model):
    """Дневной агрегат расхода на пользователя и режим.

    Дешёвый роллап для админки и аналитики. В контуре лимитов НЕ участвует:
    квоты считаются по скользящим окнам поверх `UsageEvent`.
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
    web_search_calls = models.PositiveIntegerField(default=0)
    # Историческое имя: хранит стоимость в µ$ (см. billing.limits.usage_cost).
    billable_tokens = models.PositiveBigIntegerField(default=0)
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
            # расход режима за день и суммы по всем режимам
            models.Index(fields=["user", "day", "mode"]),
            models.Index(fields=["user", "day"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.day} [{self.mode}]: {self.request_count} запр."


class UsageEvent(models.Model):
    """Журнал отдельных ИИ-запросов — источник правды для квот и аудита.

    Append-only, одна строка на успешный запрос: по нему считаются скользящие
    окна (billing.guard) и видно, чем именно был потрачен бюджет.
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
    web_search_calls = models.PositiveSmallIntegerField(default=0)
    # Историческое имя: стоимость запроса в µ$ — единица, в которой идут квоты.
    billable_tokens = models.PositiveIntegerField(default=0)
    # Ответ выдан на дешёвой модели, потому что квота была исчерпана.
    degraded = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Событие расхода ИИ"
        verbose_name_plural = "События расхода ИИ"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["user", "created_at"]),
            # основной индекс окон квоты
            models.Index(fields=["user", "mode", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} — {self.model} [{self.mode}]: {self.billable_tokens} т."
