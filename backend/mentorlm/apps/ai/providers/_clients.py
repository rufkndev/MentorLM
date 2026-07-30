"""Сетевая политика обращения к LLM: таймауты и ретраи в одном месте.

Клиенты создаём только здесь — иначе зависшее соединение ничем не ограничено:
воркер стоит на чтении, а wall-clock-проверка во вьюхе идёт между дельтами,
которых нет.
"""

from __future__ import annotations

from django.conf import settings

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


def openai_client():
    """Клиент OpenAI с общей сетевой политикой."""
    from openai import OpenAI

    return OpenAI(
        api_key=settings.OPENAI_API_KEY,
        timeout=_timeout(),
        max_retries=MAX_RETRIES,
    )


def anthropic_client():
    """Клиент Anthropic с общей сетевой политикой."""
    from anthropic import Anthropic

    return Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        timeout=_timeout(),
        max_retries=MAX_RETRIES,
    )
