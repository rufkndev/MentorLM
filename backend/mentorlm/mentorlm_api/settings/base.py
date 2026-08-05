"""Общая часть настроек MentorLM — всё, что одинаково в разработке и в проде.

Здесь нет ни одного решения, зависящего от окружения: секреты, DEBUG, кэш,
разрешённые хосты и origin'ы задают `dev.py` и `prod.py`. Всё окружение-зависимое
(БД, ключи и модели провайдеров) читается из env, поэтому модели и лимиты
меняются без правок кода.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# .../backend/mentorlm — три уровня вверх от settings/base.py.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# В Docker переменные уже в окружении и загрузка ничего не меняет; локально
# берём их из .env проекта и общего infra/env/.env.
load_dotenv(BASE_DIR / '.env')
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


# ── База данных: Postgres в Supabase ──────────────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("SUPABASE_NAME"),
        "USER": os.environ.get("SUPABASE_USER"),
        "PASSWORD": os.environ.get("SUPABASE_PASSWORD"),
        "HOST": os.environ.get("SUPABASE_HOST"),
        "PORT": os.environ.get("SUPABASE_PORT"),
    }
}


# Пароли Django нужны только для входа в админку: пользователи живут в Clerk.
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
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
# Единственный способ аутентификации — Clerk-JWT, и по умолчанию любая вьюха
# требует входа: публичные эндпоинты (health) отключают это у себя явно.
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.users.authentication.ClerkJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}


# ── Clerk ─────────────────────────────────────────────────────────────────────
# CLERK_JWKS_URL: https://<frontend-api>/.well-known/jwks.json
# CLERK_ISSUER:   https://<frontend-api> — значение claim `iss` в токене.
CLERK_JWKS_URL = os.environ.get('CLERK_JWKS_URL', '')
CLERK_ISSUER = os.environ.get('CLERK_ISSUER', '')


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
