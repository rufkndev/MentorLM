"""Провайдер OpenAI Responses API + web_search — режим «Исследовать».

Модель сама решает, когда искать в интернете; system идёт как instructions,
история — как input. Вызовы поиска считаем: они платные.
"""

from __future__ import annotations

import logging
import re
from typing import Iterator

from apps.billing.limits import WEB_SEARCH_CALLS_PER_ANSWER

from ..context import count_tokens
from ._clients import openai_client
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
            optional["reasoning"] = {"effort": params.reasoning_effort}
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
        try:
            for event in stream:
                if event.type == "response.output_text.delta":
                    visible, pending = _split_visible(pending + event.delta)
                    if visible:
                        completion += visible
                        yield visible
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

        # TODO: доставать url_citation annotations из final.output и отдавать
        # источники на фронт отдельным полем SSE — пока только текст.
        usage["web_search_calls"] = sum(
            1
            for item in (final.output or [])
            if getattr(item, "type", "") == "web_search_call"
        )
        if final.usage is not None:
            usage["prompt_tokens"] = final.usage.input_tokens
            usage["completion_tokens"] = final.usage.output_tokens
        else:  # pragma: no cover
            usage["prompt_tokens"] = count_tokens(system, params.model)
            usage["completion_tokens"] = count_tokens(completion, params.model)
