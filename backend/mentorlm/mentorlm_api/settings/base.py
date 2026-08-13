"""Общая часть настроек MentorLM — всё, что одинаково в разработке и в проде.

Здесь нет ни одного решения, зависящего от окружения: секреты, DEBUG, кэш,
разрешённые хосты и origin'ы задают `dev.py` и `prod.py`. Всё окружение-зависимое
(БД, ключи и модели провайдеров) читается из env, поэтому модели и лимиты
меняются без правок кода.
"""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

# .../backend/mentorlm — три уровня вверх от settings/base.py.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Единственный источник переменных — общий файл проекта. В Docker они приходят
# из окружения контейнера, и загрузка ничего не меняет: load_dotenv не
# перезаписывает то, что уже задано (в проде самого файла в образе и нет).
load_dotenv(BASE_DIR.parent.parent / 'infra' / 'env' / '.env')


def env_bool(name: str, default: bool) -> bool:
    """Прочитать булеву переменную окружения ("1", "true", "yes", "on")."""
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ('1', 'true', 'yes', 'on')


def env_list(name: str, default: str = '') -> list[str]:
    """Прочитать список из переменной окружения через запятую."""
    return [item.strip() for item in os.environ.get(name, default).split(',') if item.strip()]


# ── Приложения и middleware ───────────────────────────────────────────────────

INSTALLED_APPS = [
    # Django
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party
    'rest_framework',
    'corsheaders',

    # Local apps
    'apps.core',
    'apps.users',
    'apps.ai',
    'apps.conversations',
    'apps.usage',
    'apps.billing',
    'apps.memory',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'mentorlm_api.urls'

# Шаблоны нужны только админке — своих у проекта нет.
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'mentorlm_api.wsgi.application'


# ── База данных: свой Postgres в docker ───────────────────────────────────────
# База с персональными данными должна физически находиться в РФ (152-ФЗ, ч.5
# ст.18), поэтому Postgres поднимаем сами рядом с приложением, а не берём
# управляемый зарубежный. Дев и прод — две разные базы: дев не должен работать
# с боевыми данными.
#
# Имена переменных совпадают с теми, что ждёт официальный образ postgres, —
# одни и те же значения кормят и контейнер, и Django.
# Дефолты рассчитаны на запуск с хоста: dev-контейнер слушает 5433, чтобы не
# конфликтовать с системным Postgres. Внутри compose хост/порт перекрываются
# на db:5432.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "mentorlm_dev"),
        "USER": os.environ.get("POSTGRES_USER", "mentorlm"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "mentorlm"),
        "HOST": os.environ.get("POSTGRES_HOST", "127.0.0.1"),
        "PORT": os.environ.get("POSTGRES_PORT", "5433"),
    }
}


# ── Кэш: параметры соединения с Redis ─────────────────────────────────────────
# Сам CACHES собирают dev.py и prod.py — адрес Redis зависит от окружения. Общими
# остаются параметры соединения: они нужны везде, где Redis реально подключён.
REDIS_CACHE_OPTIONS = {
    # Redis отвечает за миллисекунды. Если ответа нет пару секунд, он недоступен,
    # и поток воркера не должен висеть на нём до таймаута всего запроса.
    'socket_connect_timeout': 2,
    'socket_timeout': 2,
    # Соединения в пуле живут долго и подолгу простаивают между сообщениями: без
    # пинга первый запрос после разрыва TCP падал бы вместо переподключения.
    'health_check_interval': 30,
    # Разовая сетевая потеря не должна превращаться в 500 у пользователя.
    # Единственная неидемпотентная операция — incr счётчика rate limit: при
    # потерянном ответе он посчитается дважды, то есть в сторону строгости.
    'retry_on_timeout': True,
}


# Применяются и к паролям пользователей (users.auth_views), и к админским.
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        # 8 вместо стандартных 8 по умолчанию — задано явно, чтобы порог был
        # виден здесь, а не подразумевался.
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 8},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Время храним в UTC, в локальную зону переводим при выводе пользователю.
LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


STATIC_URL = 'static/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ── DRF ───────────────────────────────────────────────────────────────────────
# Единственный способ аутентификации — свой access-токен, и по умолчанию любая
# вьюха требует входа: публичные эндпоинты (health, вход, регистрация)
# отключают это у себя явно.
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.users.authentication.SessionJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}


# ── Сессии пользователей ──────────────────────────────────────────────────────
# Схема двухтокенная (подробности — в apps/users/tokens.py): короткий access в
# памяти вкладки и длинный refresh в httpOnly-cookie.
#
# 15 минут — компромисс: отозвать выданный access нельзя (он проверяется
# подписью, без похода в базу), поэтому чем короче, тем меньше окно у украденного.
ACCESS_TOKEN_TTL = timedelta(minutes=15)
# Столько живёт «запомнить меня»: месяц без повторного ввода пароля.
REFRESH_TOKEN_TTL = timedelta(days=30)

AUTH_COOKIE_NAME = 'mlm_refresh'
# Cookie нужна только эндпоинтам сессии — на остальные запросы её не шлём.
AUTH_COOKIE_PATH = '/api/auth/'
# Lax, а не Strict: со Strict cookie не придёт при переходе по внешней ссылке,
# и пользователь увидит себя разлогиненным. None потребовал бы Secure и сломал
# бы разработку по http.
AUTH_COOKIE_SAMESITE = 'Lax'
# В деве по http; prod.py включает обязательно.
AUTH_COOKIE_SECURE = False

# Версия политики конфиденциальности, под которой пользователь дал согласие.
# Поднимать при каждом существенном изменении текста /legal/privacy: согласие
# даётся под конкретную редакцию, и это нужно уметь показать.
PRIVACY_POLICY_VERSION = '2026-08-13'


# ── Прокси к провайдерам ──────────────────────────────────────────────────────
# Через прокси идут ТОЛЬКО запросы к OpenAI/Anthropic (apps.ai.providers._clients),
# всё остальное — напрямую. Пусто — без прокси. На российском сервере обязателен:
# провайдеры не отвечают на запросы с российских IP.
# Формат: http://ЛОГИН:ПАРОЛЬ@ХОСТ:ПОРТ, также https:// и socks5://.
LLM_PROXY_URL = os.environ.get('LLM_PROXY_URL', '').strip()


# ── Модели провайдеров ────────────────────────────────────────────────────────
# Задаются через env, чтобы менять их без правок кода; читает apps.ai.registry.

# OpenAI: режим «Общий», «Исследовать» (Responses API + web_search) и дешёвая
# модель для извлечения фактов памяти.
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
OPENAI_CHAT_MODEL = os.environ.get('OPENAI_CHAT_MODEL', 'gpt-5.5')
OPENAI_RESEARCH_MODEL = os.environ.get('OPENAI_RESEARCH_MODEL', 'gpt-5.5')
OPENAI_MEMORY_MODEL = os.environ.get('OPENAI_MEMORY_MODEL', 'gpt-5-nano')

# Anthropic: режим «Код».
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
ANTHROPIC_CODE_MODEL = os.environ.get('ANTHROPIC_CODE_MODEL', 'claude-sonnet-4-6')

# Тиры для настройки «Модель ИИ» (ai.preferences): fast — дешевле базовой,
# quality пуст → откат на базовую. Цены тиров держать в billing.MODEL_PRICES.
OPENAI_CHAT_MODEL_FAST = os.environ.get('OPENAI_CHAT_MODEL_FAST', 'gpt-5')
OPENAI_CHAT_MODEL_QUALITY = os.environ.get('OPENAI_CHAT_MODEL_QUALITY', '')
ANTHROPIC_CODE_MODEL_FAST = os.environ.get('ANTHROPIC_CODE_MODEL_FAST', 'claude-haiku-4-5')
ANTHROPIC_CODE_MODEL_QUALITY = os.environ.get('ANTHROPIC_CODE_MODEL_QUALITY', '')
OPENAI_RESEARCH_MODEL_FAST = os.environ.get('OPENAI_RESEARCH_MODEL_FAST', 'gpt-5')
OPENAI_RESEARCH_MODEL_QUALITY = os.environ.get('OPENAI_RESEARCH_MODEL_QUALITY', '')

# Модели деградации: несколько ответов на упрощённой модели вместо жёсткого
# блока при исчерпанной квоте (billing.guard).
OPENAI_CHAT_MODEL_DEGRADE = os.environ.get('OPENAI_CHAT_MODEL_DEGRADE', 'gpt-5-mini')
ANTHROPIC_CODE_MODEL_DEGRADE = os.environ.get('ANTHROPIC_CODE_MODEL_DEGRADE', 'claude-haiku-4-5')
OPENAI_RESEARCH_MODEL_DEGRADE = os.environ.get('OPENAI_RESEARCH_MODEL_DEGRADE', 'gpt-5-mini')
