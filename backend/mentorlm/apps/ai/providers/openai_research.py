"""Провайдер OpenAI Responses API + web_search — режим «Исследовать».

Модель сама решает, когда искать в интернете; system идёт как instructions,
история — как input. Вызовы поиска считаем: они платные.

Источники собираем из аннотаций `url_citation`: они приходят прямо в стриме,
вперемешку с текстом, поэтому копим их по ходу (при обрыве финального ответа
уже не будет) и дособираем из `final.output`, который авторитетнее. Наверх
отдаём через `usage` — это единственный канал помимо текста.
"""

from __future__ import annotations

import logging
import re
from typing import Iterator

from apps.billing.limits import WEB_SEARCH_CALLS_PER_ANSWER

from ..context import count_tokens
from ._clients import openai_client
from ._openai import effort_for
from .base import GenParams

logger = logging.getLogger(__name__)

# Модель иногда «проговаривает» поисковые запросы прямо в текст псевдо-тегами
# <web_search_query .../> — служебный шум, который выглядит как сломанный ответ.
_TOOL_TAG = re.compile(r"<\s*/?\s*web_search_query\b[^>]*/?>", re.IGNORECASE)
# Начало тега может прийти в одной дельте, а конец — в следующей.
_TOOL_TAG_START = "<web_search_query"


def _split_visible(buffer: str) -> tuple[str, str]:
    """Разделить буфер на «можно отдать сейчас» и «придержать».

    Придерживаем только незакрытый хвост, способный дорасти до служебного тега;
    обычный текст со знаком «<» проходит без задержки.
    """
    buffer = _TOOL_TAG.sub("", buffer)
    start = buffer.rfind("<")
    if start == -1:
        return buffer, ""
    tail = buffer[start:].lower()
    unfinished_tag = (
        _TOOL_TAG_START.startswith(tail)  # ещё может дорасти до тега
        or (tail.startswith(_TOOL_TAG_START) and ">" not in tail)  # тег без «>»
    )
    return (buffer[:start], buffer[start:]) if unfinished_tag else (buffer, "")


# Потолки на список источников: он уезжает в Message.meta и на фронт, а его
# содержимое пишет не наш сервер — это заголовки и адреса найденных страниц.
MAX_SOURCES = 20
MAX_SOURCE_TITLE = 300
MAX_SOURCE_URL = 1000

_SAFE_SCHEMES = ("http://", "https://")


def _add_source(seen: dict, url, title) -> None:
    """Положить источник в накопитель, отсеяв мусор и дубли.

    Адрес и заголовок пришли из интернета, поэтому здесь же режем длину и
    схему: дальше они попадут и в БД, и в интерфейс.
    """
    url = (url or "").strip()[:MAX_SOURCE_URL]
    if not url.lower().startswith(_SAFE_SCHEMES) or len(seen) >= MAX_SOURCES:
        return
    title = (title or "").strip()[:MAX_SOURCE_TITLE]
    # Первое упоминание задаёт порядок; заголовок дополняем, если он был пуст.
    if url in seen:
        if title and not seen[url]["title"]:
            seen[url]["title"] = title
        return
    seen[url] = {"url": url, "title": title}


def _collect_from_final(final, seen: dict) -> None:
    """Дособрать цитаты из финального ответа — он авторитетнее стрима."""
    for item in getattr(final, "output", None) or []:
        for block in getattr(item, "content", None) or []:
            for ann in getattr(block, "annotations", None) or []:
                if getattr(ann, "type", "") == "url_citation":
                    _add_source(seen, getattr(ann, "url", ""), getattr(ann, "title", ""))


class OpenAIResearchProvider:
    """Responses API: текстовые дельты плюс учёт вызовов веб-поиска."""

    def stream(
        self,
        *,
        system: str,
        history: list[dict],
        params: GenParams,
        usage: dict,
    ) -> Iterator[str]:
        """Отдаёт очищенные дельты текста; usage готов после исчерпания потока."""
        from openai import BadRequestError

        client = openai_client()

        # Поиск включаем, только если его запросил сценарий (обзор обходится
        # знаниями модели).
        searching = "web_search" in params.tools
        tools = [{"type": "web_search"}] if searching else []

        base_kwargs = dict(
            model=params.model,
            instructions=system,
            input=history,
            tools=tools,
            max_output_tokens=params.max_output_tokens,
        )
        # reasoning понимают не все модели, max_tool_calls — не все версии API.
        # Приём тот же, что в _openai.create_with_optional, но вызов идёт на
        # __enter__ контекст-менеджера, поэтому цикл здесь свой.
        optional = {}
        if params.reasoning_effort:
            optional["reasoning"] = {"effort": effort_for(params)}
        if searching:
            optional["max_tool_calls"] = WEB_SEARCH_CALLS_PER_ANSWER

        while True:
            try:
                manager = client.responses.stream(**base_kwargs, **optional)
                stream = manager.__enter__()
                break
            except BadRequestError as exc:
                dropped = [k for k in optional if k in str(exc).lower()]
                if not dropped:
                    raise
                for key in dropped:
                    optional.pop(key)

        # Потолок поисков сторожим сами, ТОЛЬКО если API не принял max_tool_calls:
        # иначе обрывать нечего — модель сама остановится и напишет ответ. Именно
        # свой обрыв ровно на потолке и оставлял пользователя без ответа: сложный
        # запрос доходил до восьмого поиска раньше первой буквы текста.
        enforce_cap = searching and "max_tool_calls" not in optional

        completion = ""
        pending = ""  # хвост, который ещё может оказаться служебным тегом
        capped = False  # упёрлись в потолок поисков и оборвали чтение сами
        final = None
        # Считаем поиски по ходу стрима — устойчиво к обрыву; ниже уточним по final.
        usage["web_search_calls"] = 0
        # Источники копим по ходу: аннотации приходят вперемешку с текстом,
        # и при обрыве финального ответа уже не будет.
        sources: dict = {}
        try:
            for event in stream:
                if event.type == "response.output_text.delta":
                    visible, pending = _split_visible(pending + event.delta)
                    if visible:
                        completion += visible
                        yield visible
                elif event.type == "response.output_text.annotation.added":
                    ann = getattr(event, "annotation", None)
                    # У SDK аннотация приходит то объектом, то словарём —
                    # зависит от версии, поэтому читаем оба варианта.
                    if isinstance(ann, dict):
                        kind, url, title = (
                            ann.get("type"),
                            ann.get("url"),
                            ann.get("title"),
                        )
                    else:
                        kind = getattr(ann, "type", "")
                        url = getattr(ann, "url", "")
                        title = getattr(ann, "title", "")
                    if kind == "url_citation":
                        _add_source(sources, url, title)
                elif event.type == "response.output_item.done" and (
                    getattr(event.item, "type", "") == "web_search_call"
                ):
                    usage["web_search_calls"] += 1
                    # Страховка на случай, когда потолок не передан в API:
                    # прекращаем читать, чтобы поиски не жгли квоту дальше.
                    if enforce_cap and (
                        usage["web_search_calls"] > WEB_SEARCH_CALLS_PER_ANSWER
                    ):
                        capped = True
                        break
            # Остаток буфера тегом так и не стал — отдаём как обычный текст.
            tail = _TOOL_TAG.sub("", pending)
            if tail:
                completion += tail
                yield tail
            # Финальный ответ есть только у дочитанного стрима.
            if not capped:
                final = stream.get_final_response()
        finally:
            manager.__exit__(None, None, None)

        usage["sources"] = list(sources.values())

        if final is None:
            # Оборвали сами на потолке поисков — расход считаем своими числами.
            usage["prompt_tokens"] = count_tokens(system, params.model)
            usage["completion_tokens"] = count_tokens(completion, params.model)
            if not completion:
                logger.warning(
                    "«Исследовать»: ответ оборван на потолке поисков (%s) без текста",
                    usage["web_search_calls"],
                )
            return

        # Ответ без текста разбирать потом не по чему: причина видна только в
        # финальном объекте (обрыв по потолку токенов, отказ, пустой вывод).
        if not completion:
            logger.warning(
                "«Исследовать»: пустой ответ модели %s — status=%s, details=%s, "
                "поисков=%s",
                params.model,
                getattr(final, "status", None),
                getattr(final, "incomplete_details", None),
                usage["web_search_calls"],
            )

        _collect_from_final(final, sources)
        usage["sources"] = list(sources.values())
        usage["web_search_calls"] = sum(
            1
            for item in (final.output or [])
            if getattr(item, "type", "") == "web_search_call"
        )
        if final.usage is not None:
            usage["prompt_tokens"] = final.usage.input_tokens
            usage["completion_tokens"] = final.usage.output_tokens
            # Токены рассуждения уже входят в output_tokens — это разбивка
            # для аналитики, а не отдельная статья расхода.
            details = getattr(final.usage, "output_tokens_details", None)
            if details is not None:
                usage["thinking_tokens"] = (
                    getattr(details, "reasoning_tokens", 0) or 0
                )
        else:  # pragma: no cover
            usage["prompt_tokens"] = count_tokens(system, params.model)
            usage["completion_tokens"] = count_tokens(completion, params.model)
