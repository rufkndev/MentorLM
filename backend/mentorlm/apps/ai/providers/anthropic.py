"""Провайдер Anthropic — режим «Код».

Простой стриминг текста без thinking: system идёт отдельным параметром,
история — в messages, usage приходит в финальном сообщении.
"""

from __future__ import annotations

from typing import Iterator

from ..context import count_tokens
from ._clients import anthropic_client
from .base import GenParams


class AnthropicProvider:
    """Claude через Messages API; история нормализована в ai.context."""

    def stream(
        self,
        *,
        system: str,
        history: list[dict],
        params: GenParams,
        usage: dict,
    ) -> Iterator[str]:
        """Отдаёт дельты текста; usage готов после исчерпания потока."""
        client = anthropic_client()

        completion = ""
        with client.messages.stream(
            model=params.model,
            # max_tokens у Anthropic обязателен: это потолок, а не цель —
            # модель останавливается сама.
            max_tokens=params.max_output_tokens,
            temperature=params.temperature,
            system=system,
            messages=history,
        ) as stream:
            for text in stream.text_stream:
                completion += text
                yield text
            final = stream.get_final_message()

        if final.usage is not None:
            usage["prompt_tokens"] = final.usage.input_tokens
            usage["completion_tokens"] = final.usage.output_tokens
        else:  # pragma: no cover - подстраховка, usage тут есть всегда
            usage["prompt_tokens"] = count_tokens(system, params.model)
            usage["completion_tokens"] = count_tokens(completion, params.model)
