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
    # Сценарий диалога: он живёт вместе с чатом, а не с режимом — вернувшись в
    # старый чат, пользователь застаёт тот же пресет, с которым его вёл. Пустая
    # строка — сценарий ещё не выбран, значит действует дефолт режима.
    # Проверяется на бэке (apps.ai.scenarios), поэтому здесь просто строка.
    scenario_id = models.CharField(max_length=40, blank=True)
    title = models.CharField(max_length=255, blank=True)
    pinned = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Диалог"
        verbose_name_plural = "Диалоги"
        # Закреплённые — выше, затем по свежести.
        ordering = ("-pinned", "-updated_at")
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

    class Kind(models.TextChoices):
        TEXT = "text", "Ответ"
        NOTICE = "notice", "Уведомление системы"

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    # Уведомление (исчерпан лимит тарифа и т.п.) — часть переписки для
    # пользователя, но НЕ часть контекста модели: build_context их пропускает.
    # Раньше такие плашки жили только в состоянии фронта и пропадали при
    # возврате в чат — теперь они хранятся вместе с диалогом.
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.TEXT)
    content = models.TextField()
    # Служебные детали для UI: код лимита, показывать ли апселл, признак ответа
    # на упрощённой модели. Только для отрисовки — на генерацию не влияет.
    meta = models.JSONField(default=dict, blank=True)
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


class Attachment(models.Model):
    """Файл, прикреплённый к сообщению пользователя.

    Сам файл не храним (медиа-хранилища в MVP нет) — сохраняем извлечённый
    текст и метаданные. Текст подмешивается в контекст модели (build_context),
    поэтому вложения «видны» ей и в текущем, и в последующих ходах диалога.
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
