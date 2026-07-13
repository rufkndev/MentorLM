"""Фасад ИИ-слоя: единая точка входа для вьюх.

Скрывает выбор провайдера, сборку системного промпта и контекста за одним
вызовом. Системный промпт строится на бэке по mode + scenario_id — клиент не
может его подменить.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

from apps.billing.limits import limits_for
from apps.billing.plans import effective_plan
from apps.memory.services import build_memory_block

from .context import build_context
from .preferences import resolve_preferences
from .prompts import build_system_prompt
from .providers import GenParams, get_provider
from .registry import get_mode
from .scenarios import get_scenario


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
    plan_limits = limits_for(effective_plan(user))

    # Сценарий — база параметров генерации (температура, длина, размер контекста,
    # инструменты) и их границы. Пользовательские настройки согласуются с ним
    # мягким сдвигом в этих границах (resolve_preferences). Клиент присылает
    # только scenario_id и не может подменить ни промпт, ни параметры.
    scenario = get_scenario(conversation.mode, scenario_id)
    prefs = resolve_preferences(mode, scenario, user_settings)

    # Глобальная память: подмешиваем известные факты о пользователе (если
    # включено настройкой memory_use). Пусто — блок просто не добавится.
    memory_block = build_memory_block(user_settings)
    system = build_system_prompt(conversation.mode, scenario, prefs, memory_block)
    history = build_context(
        conversation, plan_limits, model=prefs.model,
        max_messages=prefs.context_messages,
    )

    # Живой веб-поиск — платная фича. На тарифах без него режим «Исследовать»
    # работает по знаниям модели (инструмент просто снимаем), а не блокируется.
    tools = scenario.tools
    if not plan_limits["allow_web_search"]:
        tools = tuple(t for t in tools if t != "web_search")

    params = GenParams(
        model=prefs.model,
        temperature=prefs.temperature,
        tools=tools,
        # Усилие рассуждения после согласования сценария с настройкой юзера —
        # провайдеры OpenAI передают его в API нативно, а не только через промпт.
        reasoning_effort=prefs.reasoning_effort,
        # Потолок длины ответа задаёт тариф (жёсткий финансовый предохранитель).
        max_output_tokens=plan_limits["max_output_tokens"],
    )
    usage: dict = {}
    deltas = get_provider(mode.provider).stream(
        system=system, history=history, params=params, usage=usage
    )
    return AIStream(deltas=deltas, model=prefs.model, usage=usage)
