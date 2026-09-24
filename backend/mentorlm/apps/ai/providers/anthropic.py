"""Провайдер Anthropic — режим «Код».

System идёт отдельным параметром, история — в messages, usage приходит в
финальном сообщении.

Глубина ответа управляется `output_config.effort`, а не температурой: модели
Claude 5 отвергают sampling-параметры (`temperature`, `top_p`) с 400, и
`_open_stream` ниже их молча снимает. При включённом размышлении температуру не
отправляем вовсе — незачем платить за заведомо отвергнутую опцию.

Размышление — `thinking={"type": "adaptive"}`. Текстовый поток при этом не
меняется: `stream.text_stream` отдаёт только текстовые блоки, а thinking-дельты
в него не попадают. Токены размышления провайдер включает в `output_tokens`,
поэтому отдельной цены им не нужно — расход считается сам.
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

# Наши три ступени глубины → ступени усилия у Anthropic. При включённом
# размышлении берём на ступень выше: пользователь просил именно подумать.
_EFFORT = {"low": "low", "medium": "medium", "high": "high"}
_EFFORT_THINKING = {"low": "medium", "medium": "high", "high": "xhigh"}


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


def _optional_params(params: GenParams) -> dict:
    """Опции, которые модель может и не принять, — их снимет `_open_stream`.

    Держим их одним местом, потому что они связаны: при размышлении температура
    не отправляется вообще (Claude 5 её всё равно отвергает), а усилие берётся
    из другой шкалы.
    """
    table = _EFFORT_THINKING if params.thinking else _EFFORT
    optional: dict = {
        "output_config": {"effort": table.get(params.reasoning_effort, "medium")}
    }
    if params.thinking:
        # display="omitted": ход рассуждения пользователю не показываем, но
        # оплачивается он одинаково при любом значении — это только видимость.
        optional["thinking"] = {"type": "adaptive", "display": "omitted"}
    else:
        optional["temperature"] = params.temperature
    return optional


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
                _optional_params(params),
            )
            for text in stream.text_stream:
                completion += text
                yield text
            final = stream.get_final_message()

        if final.usage is not None:
            usage["prompt_tokens"] = final.usage.input_tokens
            usage["completion_tokens"] = final.usage.output_tokens
            # Токены размышления уже входят в output_tokens — это разбивка для
            # аналитики, а не отдельная статья расхода.
            details = getattr(final.usage, "output_tokens_details", None)
            if details is not None:
                usage["thinking_tokens"] = getattr(details, "thinking_tokens", 0) or 0
        else:  # pragma: no cover - подстраховка, usage тут есть всегда
            usage["prompt_tokens"] = count_tokens(system, params.model)
            usage["completion_tokens"] = count_tokens(completion, params.model)
