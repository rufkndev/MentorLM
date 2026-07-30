"""Конфиг приложения `core` — служебные эндпоинты (health-check)."""

from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
