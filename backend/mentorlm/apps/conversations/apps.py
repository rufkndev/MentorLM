"""Конфиг приложения `conversations` — диалоги, сообщения и вложения."""

from django.apps import AppConfig


class ConversationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.conversations"
