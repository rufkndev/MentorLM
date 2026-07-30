"""Конфиг приложения `usage` — учёт расхода ИИ."""

from django.apps import AppConfig


class UsageConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.usage"
