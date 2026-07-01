"""Провайдер Anthropic — режим «Код» (Claude Sonnet 4.6).

Простой стриминг текста без thinking (решение для MVP). system передаётся
top-level параметром, история — в messages. Usage берём из финального сообщения.
"""

from __future__ import annotations

from typing import Iterator

from django.conf import settings

from ..context import MAX_OUTPUT_TOKENS, count_tokens
from .base import GenParams


class AnthropicProvider:
    def stream(
        self,
        *,
        system: str,
        history: list[dict],
        params: GenParams,
        usage: dict,
    ) -> Iterator[str]:
        from anthropic import Anthropic

        client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        # max_tokens у Anthropic обязателен — ставим высокий потолок, чтобы
        # ответ не обрывался; это лимит, а не цель, модель остановится сама.
        completion = ""
        with client.messages.stream(
            model=params.model,
            max_tokens=MAX_OUTPUT_TOKENS,
            temperature=params.temperature,
            system=system,
            messages=history,
        ) as stream:
            for text in stream.text_stream:
                completion += text
                yield text
            final = stream.get_final_message()

        # У Anthropic usage всегда есть в финальном сообщении.
        if final.usage is not None:
            usage["prompt_tokens"] = final.usage.input_tokens
            usage["completion_tokens"] = final.usage.output_tokens
        else:  # pragma: no cover - на всякий случай
            usage["prompt_tokens"] = count_tokens(system, params.model)
            usage["completion_tokens"] = count_tokens(completion, params.model)
