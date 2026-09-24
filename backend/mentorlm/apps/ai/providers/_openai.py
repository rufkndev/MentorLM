"""Общий помощник OpenAI-провайдеров: устойчивая передача необязательных опций.

Набор принимаемых параметров зависит от модели (reasoning-модели не терпят
temperature, обычные не знают reasoning_effort), а id моделей задаются через
env — поэтому не угадываем заранее, а снимаем опции по ответу 400.
"""

from __future__ import annotations

import threading
from typing import Any, Callable

# Что каждая модель уже отвергла в этом процессе: {model: {имя опции}}. Ответ
# 400 стоит целого похода к провайдеру (а в проде — ещё и через прокси), и без
# памяти мы платили бы им за каждый запрос к одной и той же модели. Кэш живёт в
# памяти процесса: смена модели в env — это перезапуск, то есть чистый кэш.
_unsupported: dict[str, set[str]] = {}
_lock = threading.Lock()

# Отдельного «режима размышления» у OpenAI нет — его роль играет усилие
# рассуждения, поэтому при включённом переключателе поднимаем его на ступень.
# Выше "high" не идём: следующие ступени приняты не всеми моделями, а лишний
# 400 на каждую новую модель мы бы оплачивали походом к провайдеру.
_EFFORT_THINKING = {"low": "medium", "medium": "high", "high": "high"}


def effort_for(params) -> str:
    """Усилие рассуждения с поправкой на переключатель размышления."""
    if not params.thinking:
        return params.reasoning_effort
    return _EFFORT_THINKING.get(params.reasoning_effort, "high")


def create_with_optional(
    create: Callable[..., Any],
    base_kwargs: dict,
    optional: dict,
    bad_request_error: type[Exception],
) -> Any:
    """Вызвать create(**base_kwargs, **optional), снимая непринятые опции.

    На BadRequestError убираем те опции, чьё имя встретилось в тексте ошибки, и
    повторяем; если снимать нечего — дело не в опциях, пробрасываем ошибку.
    Снятое запоминаем по модели, чтобы следующий запрос уже не ловил тот же 400.
    """
    model = str(base_kwargs.get("model", ""))
    with _lock:
        known = set(_unsupported.get(model, ()))
    opt = {
        k: v for k, v in optional.items() if v is not None and k not in known
    }
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
            with _lock:
                _unsupported.setdefault(model, set()).update(dropped)
