"""Провайдер OpenAI Chat Completions — режим «Общий».

Стримит текст ответа и заполняет usage из финального чанка (include_usage),
с запасным подсчётом через tiktoken.
"""

from __future__ import annotations

from typing import Iterator

from ..context import count_tokens
from ._clients import openai_client
from ._openai import cache_options, create_with_optional, effort_for
from .base import GenParams


class OpenAIChatProvider:
    """Обычный чат-комплишн: system первым сообщением, история следом."""

    def stream(
        self,
        *,
        system: str,
        history: list[dict],
        params: GenParams,
        usage: dict,
    ) -> Iterator[str]:
        """Отдаёт дельты текста; usage готов после исчерпания потока."""
        from openai import BadRequestError

        client = openai_client()
        messages = [{"role": "system", "content": system}, *history]

        completion = ""
        base_kwargs = dict(
            model=params.model,
            messages=messages,
            max_completion_tokens=params.max_output_tokens,
            stream=True,
            stream_options={"include_usage": True},
        )
        # temperature и reasoning_effort взаимоисключающи в зависимости от
        # модели — отдаём оба и снимаем непринятое по ответу 400. Опции кэша
        # промптов тоже необязательны: без них ответ просто дороже.
        stream = create_with_optional(
            client.chat.completions.create,
            base_kwargs,
            {
                "temperature": params.temperature,
                "reasoning_effort": effort_for(params),
                **cache_options(params),
            },
            BadRequestError,
        )

        for chunk in stream:
            if chunk.usage is not None:
                # prompt_tokens у OpenAI уже включает кэшированный ввод; его
                # долю передаём отдельно — billing.usage_cost посчитает её по
                # цене кэша. Записи в кэш как статьи расхода здесь нет.
                usage["prompt_tokens"] = chunk.usage.prompt_tokens
                prompt_details = getattr(chunk.usage, "prompt_tokens_details", None)
                usage["cache_read_tokens"] = (
                    getattr(prompt_details, "cached_tokens", 0) or 0
                )
                usage["completion_tokens"] = chunk.usage.completion_tokens
                # Токены рассуждения уже входят в completion_tokens — это
                # разбивка для аналитики, а не отдельная статья расхода.
                details = getattr(chunk.usage, "completion_tokens_details", None)
                if details is not None:
                    usage["thinking_tokens"] = (
                        getattr(details, "reasoning_tokens", 0) or 0
                    )
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                completion += delta
                yield delta

        # Фолбэк, если провайдер не прислал точный расход токенов.
        if "prompt_tokens" not in usage:
            prompt_text = "\n".join(m["content"] for m in messages)
            usage["prompt_tokens"] = count_tokens(prompt_text, params.model)
        if "completion_tokens" not in usage:
            usage["completion_tokens"] = count_tokens(completion, params.model)
