"""Сетевая политика обращения к LLM-провайдерам — единое место.

Клиенты создаются только здесь, чтобы таймауты и авто-ретраи были одинаковыми у
всех режимов. Без явных таймаутов зависшее соединение ничем не ограничено:
воркер стоит на чтении, лок генерации держится до TTL, а wall-clock-проверка во
вьюхе не срабатывает — она между дельтами, а дельт нет.

Ретраи SDK покрывают только ЗАПУСК запроса (сетевой сбой, 429, 5xx до первого
байта). Отказ посреди стрима повторить нельзя — ответ бы задвоился; там
работает сохранение уже написанной части (см. conversations.views).
"""

from __future__ import annotations

from django.conf import settings

# Дозвониться до провайдера: быстро — иначе пользователь ждёт впустую.
CONNECT_TIMEOUT = 15.0
# Пауза МЕЖДУ кусками ответа. Держим большой: «Исследовать» с веб-поиском молчит,
# пока модель ходит по сайтам. Меньше — рвали бы живые длинные ответы.
READ_TIMEOUT = 180.0
# Отправка запроса (у нас бывают длинные вложения).
WRITE_TIMEOUT = 30.0
# Повторы ЗАПУСКА запроса силами SDK (сетевой сбой, 429, 5xx до первого байта).
MAX_RETRIES = 2


def _timeout():
    """Таймаут httpx: раздельно на соединение и на паузу между чанками."""
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
