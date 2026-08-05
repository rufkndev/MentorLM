"""Настройки проекта разбиты по окружениям: base + dev/prod.

Какой модуль применить, решает переменная DJANGO_SETTINGS_MODULE: локально она
по умолчанию указывает на `mentorlm_api.settings.dev` (см. manage.py), в проде
задаётся явно как `mentorlm_api.settings.prod` (см. docker-compose.prod.yml).
"""
