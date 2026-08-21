"""Настройки для локальной разработки — модуль по умолчанию.

Ничего указывать не нужно: manage.py, wsgi.py и asgi.py подставляют именно этот
модуль. Прод включается только явной переменной DJANGO_SETTINGS_MODULE.
"""

import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import REDIS_CACHE_OPTIONS, env_bool, env_list

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
    'http://localhost:3000',
)

# Без этого браузер не отправит cookie с refresh-токеном на кросс-origin запрос
# и не сохранит новую из ответа: вход слетал бы на каждой перезагрузке.
#
# ⚠️ И фронт, и API должны быть на localhost (NEXT_PUBLIC_API_URL=http://localhost:8000).
# 127.0.0.1 браузер считает ДРУГИМ сайтом, а cookie у нас SameSite=Lax — на
# 127.0.0.1:8000 она просто не поедет, и виноватых будет не найти.
CORS_ALLOW_CREDENTIALS = True


# ── Кэш ───────────────────────────────────────────────────────────────────────
# На нём держатся лок генерации, rate limit и флаг «Стоп» (apps/billing/guard.py).
# Штатный режим разработки — тот же Redis, что в проде, но на своей базе (`/1`
# против `/0`), чтобы ключи окружений не смешивались, даже если однажды окажутся
# на одном сервере:
#
#     docker compose -f infra/docker-compose.dev.yml up -d redis
#     REDIS_URL=redis://127.0.0.1:6379/1        # в infra/env/.env
#
# Работать без docker можно, но откат на память процесса — только осознанный, по
# ALLOW_LOCMEM_CACHE=1. Молча подменять общий кэш нельзя: у runserver один
# процесс, поэтому на LocMem лок, лимиты и «Стоп» «работают» всегда, и проверка
# этих механизмов локально ничего не доказывает. Расхождение с продом всплыло бы
# только в бою, а цена ошибки здесь — двойные списания платных токенов.
REDIS_URL = os.environ.get('REDIS_URL', '')
ALLOW_LOCMEM_CACHE = env_bool('ALLOW_LOCMEM_CACHE', False)

if REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
            'OPTIONS': REDIS_CACHE_OPTIONS,
        }
    }
elif ALLOW_LOCMEM_CACHE:
    CACHES = {
        'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
    }
else:
    raise ImproperlyConfigured(
        'REDIS_URL не задан. Поднимите dev-Redis:\n'
        '    docker compose -f infra/docker-compose.dev.yml up -d redis\n'
        'и пропишите в infra/env/.env строку\n'
        '    REDIS_URL=redis://127.0.0.1:6379/1\n'
        'Либо, если docker сейчас не нужен, разрешите кэш в памяти процесса явно:\n'
        '    ALLOW_LOCMEM_CACHE=1\n'
        'В этом режиме лок генерации, rate limit и «Стоп» живут внутри одного\n'
        'процесса и ведут себя не так, как в проде, — проверять их бесполезно.'
    )


# ── Почта ─────────────────────────────────────────────────────────────────────
# По умолчанию письма печатаются в консоль runserver целиком, вместе со ссылкой
# из письма: разрабатывать сброс пароля, не имея доступа к чужому ящику, иначе
# невозможно. Реальную отправку через Postbox включает наличие ключей в .env —
# так проверяют вёрстку письма в настоящем почтовом клиенте, ничего не
# раскомментируя.
if os.environ.get('POSTBOX_SECRET', '').strip():
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'


# Логи
# Коротко и в консоль: подробности отладки и так видны через DEBUG.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
