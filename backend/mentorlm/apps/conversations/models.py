"""Модели переписки: диалог, сообщение и вложение к нему."""

from django.db import models


class Conversation(models.Model):
    """Диалог пользователя в одном из режимов MentorLM."""

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
    # Сценарий живёт вместе с чатом, а не с режимом: вернувшись в старый чат,
    # пользователь застаёт тот же пресет. Пустая строка — дефолт режима.
    # Значение проверяет ai.scenarios, поэтому здесь просто строка.
    scenario_id = models.CharField(max_length=40, blank=True)
    title = models.CharField(max_length=255, blank=True)
    pinned = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Диалог"
        verbose_name_plural = "Диалоги"
        # Закреплённые — выше, дальше по свежести.
        ordering = ("-pinned", "-updated_at")
        indexes = [
            # список чатов пользователя в конкретном режиме
            models.Index(fields=["user", "mode"]),
            # последние чаты пользователя (сайдбар)
            models.Index(fields=["user", "-updated_at"]),
        ]

    def __str__(self) -> str:
        return self.title or f"{self.get_mode_display()} #{self.pk}"


class Message(models.Model):
    """Одно сообщение диалога — вопрос, ответ модели или уведомление системы."""

    class Role(models.TextChoices):
        USER = "user", "Пользователь"
        ASSISTANT = "assistant", "Ассистент"

    class Kind(models.TextChoices):
        TEXT = "text", "Ответ"
        NOTICE = "notice", "Уведомление системы"

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    # Уведомление (исчерпан лимит и т.п.) — часть переписки для пользователя, но
    # не часть контекста модели: ai.context их пропускает. Храним в БД, иначе
    # плашка пропадала бы при возврате в чат.
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.TEXT)
    content = models.TextField()
    # Детали для отрисовки: код лимита, показывать ли апселл, признак ответа на
    # упрощённой модели. На генерацию не влияет.
    meta = models.JSONField(default=dict, blank=True)
    model = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Сообщение"
        verbose_name_plural = "Сообщения"
        ordering = ("created_at",)
        indexes = [
            # выборка истории по порядку — основа «памяти» диалога
            models.Index(fields=["conversation", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_role_display()}: {self.content[:40]}"


class Attachment(models.Model):
    """Файл при сообщении пользователя: храним не сам файл, а извлечённый текст.

    Медиа-хранилища в MVP нет, а текст подмешивается в контекст (ai.context),
    поэтому вложения «видны» модели и в следующих ходах диалога.
    """

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True)
    size = models.PositiveIntegerField(default=0)
    extracted_text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Вложение"
        verbose_name_plural = "Вложения"
        ordering = ("id",)

    def __str__(self) -> str:
        return f"{self.filename} ({self.size} B)"
