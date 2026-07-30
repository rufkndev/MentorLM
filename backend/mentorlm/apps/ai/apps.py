"""Конфиг приложения `ai` — слой работы с LLM (моделей и URL не имеет)."""

from django.apps import AppConfig


class AiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ai"
    verbose_name = "AI"
