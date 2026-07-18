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
        from openai import BadRequestError, OpenAI

        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        # Веб-поиск включаем только если сценарий его запросил (напр. «обзор»
        # отвечает по знаниям модели без поиска).
        tools = (
            [{"type": "web_search"}] if "web_search" in params.tools else []
        )

        base_kwargs = dict(
            model=params.model,
            instructions=system,
            input=history,
            tools=tools,
            # Потолок вывода — финансовый предохранитель тарифа (сверху).
            max_output_tokens=params.max_output_tokens,
        )
        # reasoning_effort передаём нативно тем моделям, что его поддерживают;
        # обычные модели на него ругаются (400) — тогда повторяем без него.
        # .stream() бьёт в API на __enter__, поэтому входим в контекст вручную.
        def _open(with_reasoning: bool):
            kwargs = dict(base_kwargs)
            if with_reasoning and params.reasoning_effort:
                kwargs["reasoning"] = {"effort": params.reasoning_effort}
            return client.responses.stream(**kwargs)

        try:
            manager = _open(True)
            stream = manager.__enter__()
        except BadRequestError as exc:
            if params.reasoning_effort and "reasoning" in str(exc).lower():
                manager = _open(False)
                stream = manager.__enter__()
            else:
                raise

        completion = ""
        # Вызовы веб-поиска считаем по ходу стрима (устойчиво к обрыву) и уточняем
        # по final — они платные и идут в расчётную стоимость запроса (billable).
        usage["web_search_calls"] = 0
        try:
            for event in stream:
                if event.type == "response.output_text.delta":
                    completion += event.delta
                    yield event.delta
                elif event.type == "response.output_item.done" and (
                    getattr(event.item, "type", "") == "web_search_call"
                ):
                    usage["web_search_calls"] += 1
            final = stream.get_final_response()
        finally:
            manager.__exit__(None, None, None)

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
