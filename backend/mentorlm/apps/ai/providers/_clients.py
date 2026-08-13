"""Сетевая политика обращения к LLM: прокси, таймауты и ретраи в одном месте.

Клиенты создаём только здесь — иначе зависшее соединение ничем не ограничено:
воркер стоит на чтении, а wall-clock-проверка во вьюхе идёт между дельтами,
которых нет. И только здесь настраивается прокси: провайдеры недоступны с
российских IP, поэтому на проде без него не работает ни один режим.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from django.conf import settings

logger = logging.getLogger(__name__)

# Дозвон до провайдера: быстро, иначе пользователь ждёт впустую.
CONNECT_TIMEOUT = 15.0
# Пауза МЕЖДУ кусками ответа. Большая: «Исследовать» молчит, пока модель ходит
# по сайтам; меньше — рвали бы живые длинные ответы.
READ_TIMEOUT = 180.0
# Отправка запроса (бывают длинные вложения).
WRITE_TIMEOUT = 30.0
# Ретраи SDK покрывают только ЗАПУСК запроса (сбой сети, 429, 5xx до первого
# байта). Обрыв посреди стрима не повторяем — ответ бы задвоился.
MAX_RETRIES = 2


def _timeout():
    """Таймаут httpx: раздельно на соединение, запись и паузу между чанками."""
    import httpx

    return httpx.Timeout(
        READ_TIMEOUT, connect=CONNECT_TIMEOUT, write=WRITE_TIMEOUT
    )


def _make_http_client(label: str):
    """Транспорт httpx с прокси и общей политикой таймаутов.

    Таймаут задаём здесь, а не только в SDK: со своим http_client клиент SDK
    берёт таймаут транспорта, и без этой строки политика выше потерялась бы
    молча.
    """
    import httpx

    proxy = (settings.LLM_PROXY_URL or "").strip() or None
    if proxy:
        # Хост без логина и пароля: адрес прокси в логах полезен, учётные
        # данные — нет.
        logger.info("LLM-клиент %s: трафик через прокси %s", label, httpx.URL(proxy).host)
    else:
        logger.info("LLM-клиент %s: прямое соединение, прокси не задан", label)

    return httpx.Client(
        proxy=proxy,
        timeout=_timeout(),
        # Пул переиспользуется между запросами (см. кэш ниже): без ограничения
        # всплеск параллельных ответов открыл бы соединений сколько угодно.
        limits=httpx.Limits(max_connections=64, max_keepalive_connections=16),
    )


# Транспорт кэшируем на процесс, а сами клиенты SDK создаются на каждый ответ.
# Иначе пул соединений (и рукопожатие с прокси) заводился бы заново на каждое
# сообщение пользователя, а старый никто бы не закрывал. httpx.Client
# потокобезопасен, поэтому его же берёт фоновый поток извлечения памяти.
@lru_cache(maxsize=1)
def _openai_http():
    return _make_http_client("openai")


@lru_cache(maxsize=1)
def _anthropic_http():
    return _make_http_client("anthropic")


def openai_client():
    """Клиент OpenAI с общей сетевой политикой."""
    from openai import OpenAI

    return OpenAI(
        api_key=settings.OPENAI_API_KEY,
        http_client=_openai_http(),
        timeout=_timeout(),
        max_retries=MAX_RETRIES,
    )


def anthropic_client():
    """Клиент Anthropic с общей сетевой политикой."""
    from anthropic import Anthropic

    return Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        http_client=_anthropic_http(),
        timeout=_timeout(),
        max_retries=MAX_RETRIES,
    )
