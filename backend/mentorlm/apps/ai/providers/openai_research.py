"""Провайдер OpenAI Responses API + web_search — режим «Исследовать».

Стримит текст ответа, модель сама решает, когда искать в интернете. Источники
(url_citation annotations) в MVP не отдаём на фронт — оставлен задел (TODO).
system передаётся как instructions, история — как input.
"""

from __future__ import annotations

import re
from typing import Iterator

from apps.billing.limits import WEB_SEARCH_CALLS_PER_ANSWER

from ..context import count_tokens
from ._clients import openai_client
from .base import GenParams

# Модель иногда «проговаривает» свои поисковые запросы прямо в текст —
# псевдо-тегами вида <web_search_query query="..."/>. Это служебный шум:
# пользователю он не нужен и выглядит как сломанный ответ, поэтому вырезаем.
_TOOL_TAG = re.compile(r"<\s*/?\s*web_search_query\b[^>]*/?>", re.IGNORECASE)
# Начало такого тега может прийти в одной дельте, а конец — в следующей,
# поэтому «хвост», который ещё может дорасти до тега, придерживаем в буфере.
_TOOL_TAG_START = "<web_search_query"


def _split_visible(buffer: str) -> tuple[str, str]:
    """Разделить накопленный текст на «можно отдать» и «придержать».

    Придерживаем только незакрытый хвост, который может оказаться началом
    служебного тега; обычный текст со знаком «<» проходит без задержки.
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
    def stream(
        self,
        *,
        system: str,
        history: list[dict],
        params: GenParams,
        usage: dict,
    ) -> Iterator[str]:
        from openai import BadRequestError

        client = openai_client()

        # Веб-поиск включаем только если сценарий его запросил (напр. «обзор»
        # отвечает по знаниям модели без поиска).
        searching = "web_search" in params.tools
        tools = [{"type": "web_search"}] if searching else []

        base_kwargs = dict(
            model=params.model,
            instructions=system,
            input=history,
            tools=tools,
            # Потолок вывода — финансовый предохранитель тарифа (сверху).
            max_output_tokens=params.max_output_tokens,
        )
        # Необязательные параметры: reasoning понимают только reasoning-модели,
        # max_tool_calls — не все версии API. Пробуем со всеми и по тексту 400
        # снимаем ровно те, на которые ругается провайдер (тот же приём, что в
        # _openai.create_with_optional, но здесь вызов идёт на __enter__).
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

        completion = ""
        pending = ""  # хвост, который ещё может оказаться служебным тегом
        capped = False  # упёрлись в потолок поисков и оборвали чтение сами
        final = None
        # Вызовы веб-поиска считаем по ходу стрима (устойчиво к обрыву) и уточняем
        # по final — они платные и идут в расчётную стоимость запроса (billable).
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
                    # Страховка на случай, если max_tool_calls не поддержан:
                    # прекращаем читать ответ, чтобы поиски не жгли квоту
                    # дальше. Написанная часть сохранится как обычно.
                    if usage["web_search_calls"] >= WEB_SEARCH_CALLS_PER_ANSWER:
                        capped = True
                        break
            # Остаток буфера тегом так и не стал — отдаём как обычный текст.
            tail = _TOOL_TAG.sub("", pending)
            if tail:
                completion += tail
                yield tail
            # Финальный ответ есть только у дочитанного стрима; если оборвали
            # сами (потолок поисков) — запрашивать его нельзя.
            if not capped:
                final = stream.get_final_response()
        finally:
            manager.__exit__(None, None, None)

        if final is None:
            # Стрим оборван на потолке поисков: расход считаем по своим числам,
            # web_search_calls уже посчитаны по ходу.
            usage["prompt_tokens"] = count_tokens(system, params.model)
            usage["completion_tokens"] = count_tokens(completion, params.model)
            return

        # TODO: достать url_citation annotations из final.output и отдавать
        # источники на фронт (отдельным полем SSE) — пока только текст.
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
