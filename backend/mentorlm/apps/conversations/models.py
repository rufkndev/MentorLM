from django.db import models


class Conversation(models.Model):
    """Диалог в одном из режимов MentorLM (Общий / Код / Модели)."""

    class Mode(models.TextChoices):
        CHAT = "chat", "Общий"
        CODE = "code", "Код"
        RESEARCH = "research", "Модели"

    user = models.ForeignKey(
        "users.UserProfile",
        on_delete=models.CASCADE,
        related_name="conversations",
    )
    mode = models.CharField(max_length=20, choices=Mode.choices)
    title = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Диалог"
        verbose_name_plural = "Диалоги"
        ordering = ("-updated_at",)
        indexes = [
            # список чатов пользователя в конкретном режиме
            models.Index(fields=["user", "mode"]),
            # последние чаты пользователя (для сайдбара)
            models.Index(fields=["user", "-updated_at"]),
        ]

    def __str__(self) -> str:
        return self.title or f"{self.get_mode_display()} #{self.pk}"


class Message(models.Model):
    """Одно сообщение внутри диалога."""

    class Role(models.TextChoices):
        USER = "user", "Пользователь"
        ASSISTANT = "assistant", "Ассистент"

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    content = models.TextField()
    model = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Сообщение"
        verbose_name_plural = "Сообщения"
        ordering = ("created_at",)
        indexes = [
            # выборка истории диалога по порядку — основа "памяти" ИИ
            models.Index(fields=["conversation", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_role_display()}: {self.content[:40]}"
