#!/usr/bin/env python
"""Точка входа для management-команд Django (runserver, migrate и прочее)."""
import os
import sys


def main():
    """Выполнить команду из argv с настройками проекта."""
    # По умолчанию — настройки разработки; прод задаёт переменную явно (compose).
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mentorlm_api.settings.dev')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
