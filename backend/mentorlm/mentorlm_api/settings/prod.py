"""Настройки прода. Включаются только явным DJANGO_SETTINGS_MODULE.

Принцип модуля — падать на старте, а не работать наполовину: каждая переменная,
без которой прод небезопасен или неработоспособен, читается через `_require` и
роняет процесс, если не задана. Поэтому поднять прод с dev-значениями нельзя.
"""

import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import BASE_DIR, DATABASES, MIDDLEWARE, REDIS_CACHE_OPTIONS, env_list


def _require(name: str) -> str:
    """Обязательная переменная окружения; пустая или отсутствующая — падаем."""
    value = os.environ.get(name, '').strip()
    if not value:
        raise ImproperlyConfigured(
            f'Переменная окружения {name} обязательна для mentorlm_api.settings.prod'
        )
    return value


SECRET_KEY = _require('DJANGO_SECRET_KEY')

# Константой, а не из env: DEBUG=True в проде раскрыл бы трейсбеки и настройки.
DEBUG = False

_allowed_hosts = env_list('ALLOWED_HOSTS')
if not _allowed_hosts:
    raise ImproperlyConfigured('ALLOWED_HOSTS обязателен в проде')
# Плюс петля: healthcheck контейнера ходит на 127.0.0.1, минуя nginx.
ALLOWED_HOSTS = _allowed_hosts + ['127.0.0.1', 'localhost']

# Нужен для входа в админку по https (иначе CSRF-проверка отклонит форму).
CSRF_TRUSTED_ORIGINS = env_list('CSRF_TRUSTED_ORIGINS')
if not CSRF_TRUSTED_ORIGINS:
    raise ImproperlyConfigured('CSRF_TRUSTED_ORIGINS обязателен в проде')

# Фронт и API живут на одном домене, поэтому браузер CORS не задействует.
# Список держим на случай, если API однажды переедет на отдельный поддомен.
CORS_ALLOWED_ORIGINS = env_list('CORS_ALLOWED_ORIGINS')


# ── Кэш: Redis обязателен ─────────────────────────────────────────────────────
# На кэше держатся лок генерации, rate limit и флаг «Стоп» (apps/billing/guard.py).
# На памяти процесса каждый воркер считал бы лимиты сам, и параллельные запросы
# одного пользователя проскакивали бы квоту — поэтому здесь только общий Redis.
# Значение приходит из docker-compose.prod.yml (redis://redis:6379/0) и
# перекрывает env-файл: адрес сервиса — часть топологии стека, не настройка.
REDIS_URL = _require('REDIS_URL')

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': REDIS_URL,
        'OPTIONS': REDIS_CACHE_OPTIONS,
    }
}


# ── База данных ───────────────────────────────────────────────────────────────
# Соединение переиспользуется между запросами, иначе на каждый ответ уходит
# лишний round-trip до Postgres. ⚠️ Верхняя граница числа соединений — это
# workers × threads из gunicorn.conf.py (сейчас 2 × 16 = 32): если у БД лимит
# ниже, используйте pooler-порт провайдера или поставьте CONN_MAX_AGE = 0.
DATABASES['default']['CONN_MAX_AGE'] = 60
DATABASES['default']['OPTIONS'] = {'connect_timeout': 5}


# ── Статика: whitenoise ───────────────────────────────────────────────────────
# Статика нужна только админке, поэтому отдаём её самим приложением, без общего
# с nginx тома. Файлы собирает `collectstatic` при старте контейнера.
MIDDLEWARE = (
    MIDDLEWARE[:1] + ['whitenoise.middleware.WhiteNoiseMiddleware'] + MIDDLEWARE[1:]
)

STATIC_ROOT = BASE_DIR / 'staticfiles'

STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}


# ── Безопасность ──────────────────────────────────────────────────────────────
# TLS терминирует nginx, поэтому о https Django узнаёт из заголовка — без этого
# он считал бы соединение незащищённым и зациклил редирект.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = True
# Проба контейнера ходит по http на петлю: без исключения она ловила бы 301.
SECURE_REDIRECT_EXEMPT = [r'^api/health/$']

# 30 дней на старте: браузер запомнит требование https на этот срок, и ошибка в
# сертификате не отрежет домен на год. Поднять до 31536000, когда всё устоится.
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# Попадание в preload-список браузеров требует HSTS на год и необратимо на
# практике: домен нельзя быстро вернуть в http, если что-то пойдёт не так.
# Пока срок 30 дней, включать нечего — предупреждение гасим осознанно.
SILENCED_SYSTEM_CHECKS = ['security.W021']

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'same-origin'


# ── Логи ──────────────────────────────────────────────────────────────────────
# Только stdout: логи забирает docker (ротация настроена в compose). Файлов не
# пишем — контейнер должен оставаться без состояния.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'standard': {
            'format': '{asctime} {levelname} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'standard',
        },
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
    'loggers': {
        # 4xx сыплются постоянно (истёкшие токены, исчерпанные лимиты) — в логах
        # держим только настоящие проблемы.
        'django.request': {'level': 'WARNING'},
    },
}
