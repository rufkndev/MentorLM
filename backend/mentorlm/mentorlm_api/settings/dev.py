"""Настройки для локальной разработки — модуль по умолчанию.

Ничего указывать не нужно: manage.py, wsgi.py и asgi.py подставляют именно этот
модуль. Прод включается только явной переменной DJANGO_SETTINGS_MODULE.
"""

import os

from .base import *  # noqa: F403
from .base import env_bool, env_list

# Ключ разработки: в проде такой не пройдёт — prod.py требует настоящий из env.
SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-wjout$wum05ks$lmj8nawffg8zl-$=uh089$)^u6dv8^02)%ib',
)

DEBUG = env_bool('DEBUG', True)

ALLOWED_HOSTS = env_list('ALLOWED_HOSTS', 'localhost,127.0.0.1')

# Фронт живёт на другом порту, поэтому CORS нужен (в проде общий домен и он
# не задействован).
CORS_ALLOWED_ORIGINS = env_list(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:3000,http://127.0.0.1:3000',
)


# ── Кэш ───────────────────────────────────────────────────────────────────────
# На нём держатся лок генерации, rate limit и флаг «Стоп» (apps/billing/guard.py).
# Локально хватает памяти процесса — runserver работает в один воркер. Если
# поднят REDIS_URL (infra/docker-compose.dev.yml), используем его: ближе к проду.
REDIS_URL = os.environ.get('REDIS_URL', '')

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': REDIS_URL,
    }
    if REDIS_URL
    else {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}


# ── Логи ──────────────────────────────────────────────────────────────────────
# Коротко и в консоль: подробности отладки и так видны через DEBUG.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
