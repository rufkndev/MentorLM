"""Фасад ИИ-слоя: единая точка входа для вьюх.

Скрывает выбор провайдера, сборку системного промпта и контекста за одним
вызовом. Системный промпт строится на бэке по mode + scenario_id — клиент не
может его подменить.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

from apps.billing.limits import limits_for

from .context import build_context, resolve_model
from .prompts import build_system_prompt
from .providers import GenParams, get_provider
from .registry import get_mode


@dataclass
class AIStream:
    """Результат запуска генерации: поток текста, выбранная модель и usage."""

    deltas: Iterator[str]
    model: str
    usage: dict


def run_conversation_stream(conversation, scenario_id, user) -> AIStream:
    """Готовит и запускает потоковую генерацию ответа для диалога.

    usage заполняется провайдером по ходу стрима — читать его нужно ПОСЛЕ того,
    как поток deltas полностью исчерпан.
    """
    mode = get_mode(conversation.mode)
    user_settings = user.settings
    plan_limits = limits_for(user.plan)

    model = resolve_model(mode, user_settings)
    system = build_system_prompt(conversation.mode, scenario_id, user_settings)
    history = build_context(
        conversation, user_settings, plan_limits, model=model
    )

    params = GenParams(
        model=model,
        temperature=user_settings.temperature,
        response_length=user_settings.response_length,
    )
    usage: dict = {}
    deltas = get_provider(mode.provider).stream(
        system=system, history=history, params=params, usage=usage
    )
    return AIStream(deltas=deltas, model=model, usage=usage)
