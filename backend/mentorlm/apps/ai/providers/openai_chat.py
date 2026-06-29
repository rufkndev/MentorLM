"""Провайдер OpenAI Chat Completions — режим «Общий».

Перенос из старого conversations/services.stream_chat_completion. Стримит токены
и заполняет usage из финального чанка include_usage (с фолбэком на tiktoken).
"""

from __future__ import annotations

from typing import Iterator

from django.conf import settings

from ..context import RESPONSE_MAX_TOKENS, count_tokens
from .base import GenParams


class OpenAIChatProvider:
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
        max_tokens = RESPONSE_MAX_TOKENS.get(
            params.response_length, RESPONSE_MAX_TOKENS["balanced"]
        )
        messages = [{"role": "system", "content": system}, *history]

        completion = ""
        base_kwargs = dict(
            model=params.model,
            messages=messages,
            # max_tokens устарел в пользу max_completion_tokens (док OpenAI 2026).
            max_completion_tokens=max_tokens,
            stream=True,
            stream_options={"include_usage": True},
        )
        try:
            stream = client.chat.completions.create(
                temperature=params.temperature, **base_kwargs
            )
        except BadRequestError as exc:
            # Reasoning-модели (o-series / gpt-5) принимают только temperature=1 —
            # повторяем без параметра, чтобы модель взяла значение по умолчанию.
            if "temperature" in str(exc):
                stream = client.chat.completions.create(**base_kwargs)
            else:
                raise

        for chunk in stream:
            if chunk.usage is not None:
                usage["prompt_tokens"] = chunk.usage.prompt_tokens
                usage["completion_tokens"] = chunk.usage.completion_tokens
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                completion += delta
                yield delta

        # Фолбэк, если провайдер не вернул точный расход токенов.
        if "prompt_tokens" not in usage:
            prompt_text = "\n".join(m["content"] for m in messages)
            usage["prompt_tokens"] = count_tokens(prompt_text, params.model)
        if "completion_tokens" not in usage:
            usage["completion_tokens"] = count_tokens(completion, params.model)
