"""Помощники, общие для OpenAI-провайдеров (chat и research).

Главное здесь — устойчивая передача необязательных параметров. Разные модели
принимают разный набор: reasoning-модели (o-series/gpt-5) требуют temperature=1
и понимают reasoning_effort; обычные модели — наоборот. Заранее знать это по id
модели ненадёжно (id задаются через env и меняются), поэтому пробуем со всеми
опциями и по ответу 400 снимаем ровно те, на которые ругается провайдер.
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

    На BadRequestError убираем те необязательные параметры, чьё имя встретилось
    в тексте ошибки, и повторяем. Если снять нечего — пробрасываем ошибку (значит
    дело не в опциональных параметрах). None-значения опций отбрасываем сразу.
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
