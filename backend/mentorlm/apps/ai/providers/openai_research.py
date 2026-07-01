"""Провайдер OpenAI Responses API + web_search — режим «Исследовать».

Стримит текст ответа, модель сама решает, когда искать в интернете. Источники
(url_citation annotations) в MVP не отдаём на фронт — оставлен задел (TODO).
system передаётся как instructions, история — как input.
"""

from __future__ import annotations

from typing import Iterator

from django.conf import settings

from ..context import count_tokens
from .base import GenParams


class OpenAIResearchProvider:
    def stream(
        self,
        *,
        system: str,
        history: list[dict],
        params: GenParams,
        usage: dict,
    ) -> Iterator[str]:
        from openai import OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        # Веб-поиск включаем только если сценарий его запросил (напр. «обзор»
        # отвечает по знаниям модели без поиска).
        tools = (
            [{"type": "web_search"}] if "web_search" in params.tools else []
        )

        completion = ""
        with client.responses.stream(
            model=params.model,
            instructions=system,
            input=history,
            tools=tools,
        ) as stream:
            for event in stream:
                if event.type == "response.output_text.delta":
                    completion += event.delta
                    yield event.delta
            final = stream.get_final_response()

        # TODO: достать url_citation annotations из final.output и отдавать
        # источники на фронт (отдельным полем SSE) — пока только текст.
        if final.usage is not None:
            usage["prompt_tokens"] = final.usage.input_tokens
            usage["completion_tokens"] = final.usage.output_tokens
        else:  # pragma: no cover
            usage["prompt_tokens"] = count_tokens(system, params.model)
            usage["completion_tokens"] = count_tokens(completion, params.model)
