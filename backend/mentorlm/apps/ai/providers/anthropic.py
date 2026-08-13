"""Провайдер Anthropic — режим «Код».

Простой стриминг текста без thinking: system идёт отдельным параметром,
история — в messages, usage приходит в финальном сообщении.
"""

from __future__ import annotations

from contextlib import ExitStack
from typing import Iterator

from ..context import count_tokens
from ._clients import anthropic_client
from .base import GenParams

# Опции, которые модель не приняла: id моделей задаются через env, поэтому не
# угадываем заранее (новые Claude отвергают temperature, старые — принимают), а
# снимаем опцию по тексту 400 и запоминаем на процесс, чтобы не платить лишним
# запросом за каждое сообщение.
_UNSUPPORTED: dict[str, set[str]] = {}


def _open_stream(stack: ExitStack, client, base_kwargs: dict, optional: dict):
    """Открыть стрим, снимая опции, которые модель не принимает.

    Ошибка приходит на входе в контекст, до первой дельты, поэтому повтор
    ничего не задваивает.
    """
    from anthropic import BadRequestError

    known = _UNSUPPORTED.setdefault(base_kwargs["model"], set())
    opt = {k: v for k, v in optional.items() if v is not None and k not in known}
    while True:
        try:
            return stack.enter_context(client.messages.stream(**base_kwargs, **opt))
        except BadRequestError as exc:
            msg = str(exc).lower()
            dropped = [k for k in opt if k.lower() in msg]
            if not dropped:
                raise
            for key in dropped:
                opt.pop(key)
                known.add(key)


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
        with ExitStack() as stack:
            stream = _open_stream(
                stack,
                client,
                {
                    "model": params.model,
                    # max_tokens у Anthropic обязателен: это потолок, а не цель —
                    # модель останавливается сама.
                    "max_tokens": params.max_output_tokens,
                    "system": system,
                    "messages": history,
                },
                {"temperature": params.temperature},
            )
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
