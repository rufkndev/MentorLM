from django.db import models


class UserMemoryFact(models.Model):
    """Устойчивый факт о пользователе для глобальной («межчатовой») памяти.

    Извлекается отдельным LLM-запросом после ответа ассистента (если включена
    автопамять) и подмешивается в системный промпт будущих диалогов. В отличие
    от истории `Message`, факт не привязан к одному диалогу и живёт на уровне
    аккаунта. Связано с users.UserProfile (см. db-user-identity).
    """

    user = models.ForeignKey(
        "users.UserProfile",
        on_delete=models.CASCADE,
        related_name="memory_facts",
    )
    content = models.CharField(max_length=300)
    # Диалог, из которого факт извлечён (для отладки/удаления вместе с чатом).
    source_conversation = models.ForeignKey(
        "conversations.Conversation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Обновляется, когда факт был подмешан в ответ — свежие важнее при отборе.
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Факт памяти"
        verbose_name_plural = "Факты памяти"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.user}: {self.content[:50]}"
