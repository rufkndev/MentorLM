"""Общий помощник OpenAI-провайдеров: устойчивая передача необязательных опций.

Набор принимаемых параметров зависит от модели (reasoning-модели не терпят
temperature, обычные не знают reasoning_effort), а id моделей задаются через
env — поэтому не угадываем заранее, а снимаем опции по ответу 400.
"""

from __future__ import annotations

from typing import Any, Callable


def create_with_optional(
    create: Callable[..., Any],
    base_kwargs: dict,
    optional: dict,
    bad_request_error: type[Exception],
) -> Any:
    """Вызвать create(**base_kwargs, **optional), снимая непринятые опции.

    На BadRequestError убираем те опции, чьё имя встретилось в тексте ошибки, и
    повторяем; если снимать нечего — дело не в опциях, пробрасываем ошибку.
    """
    opt = {k: v for k, v in optional.items() if v is not None}
    while True:
        try:
            return create(**base_kwargs, **opt)
        except bad_request_error as exc:
            msg = str(exc).lower()
            dropped = [k for k in opt if k.lower() in msg]
            if not dropped:
                raise
            for key in dropped:
                opt.pop(key)
