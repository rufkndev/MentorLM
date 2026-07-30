"""Модель глобальной памяти — устойчивые факты о пользователе между диалогами."""

from django.db import models


class UserMemoryFact(models.Model):
    """Факт о пользователе, живущий на уровне аккаунта, а не одного диалога.

    Извлекается фоновым LLM-запросом после ответа (при включённой автопамяти) и
    подмешивается в системный промпт будущих диалогов.
    """

    user = models.ForeignKey(
        "users.UserProfile",
        on_delete=models.CASCADE,
        related_name="memory_facts",
    )
    content = models.CharField(max_length=300)
    # Откуда факт взялся — для отладки и удаления вместе с чатом.
    source_conversation = models.ForeignKey(
        "conversations.Conversation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Обновляется при подмешивании факта в промпт: свежие важнее при отборе.
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
