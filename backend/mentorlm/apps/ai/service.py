"""Фасад ИИ-слоя: единственная точка входа для вьюх.

Прячет за одним вызовом выбор провайдера, сборку системного промпта, контекста
и параметров генерации; клиент влияет на них только через mode + scenario_id.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

from apps.billing.limits import (
    MAX_CONTEXT_MESSAGES,
    MAX_OUTPUT_TOKENS,
    limits_for,
)
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


def run_conversation_stream(
    conversation, scenario_id, user, *, degrade: bool = False
) -> AIStream:
    """Подготовить и запустить потоковую генерацию ответа для диалога.

    `degrade=True` — квота режима исчерпана (billing.guard): отвечаем на дешёвой
    модели и без веб-поиска, чтобы дать несколько запросов вместо жёсткого блока.
    `usage` провайдер заполняет по ходу стрима — читать ПОСЛЕ того, как поток
    deltas полностью исчерпан.
    """
    mode = get_mode(conversation.mode)
    user_settings = user.settings
    plan_limits = limits_for(effective_plan(user))

    # Сценарий задаёт базу и границы параметров генерации, настройки юзера —
    # мягкий сдвиг внутри них. Ни промпт, ни параметры клиент подменить не может.
    scenario = get_scenario(conversation.mode, scenario_id)
    prefs = resolve_preferences(mode, scenario, user_settings)

    # Деградация: дешёвая модель режима вместо выбранной.
    model = mode.degrade_model if degrade else prefs.model

    # Глобальная память — платная фича: нужен и тариф, и включённая настройка.
    memory_block = (
        build_memory_block(user_settings) if plan_limits["allow_memory"] else ""
    )
    system = build_system_prompt(conversation.mode, scenario, prefs, memory_block)

    # Длина предыстории — те же слои, что у остальных настроек: тариф ставит
    # потолок, сценарий — базу, «Глубина контекста» сдвигает внутри неё, сверху
    # глобальный предохранитель. Free → 0: только текущий вопрос, без истории.
    max_messages = min(
        prefs.context_messages,
        plan_limits["context_messages"],
        MAX_CONTEXT_MESSAGES,
    )
    history = build_context(conversation, max_messages=max_messages)

    # Веб-поиск — платная фича; без него «Исследовать» отвечает по знаниям модели.
    tools = scenario.tools
    if degrade or not plan_limits["allow_web_search"]:
        tools = tuple(t for t in tools if t != "web_search")

    params = GenParams(
        model=model,
        temperature=prefs.temperature,
        tools=tools,
        # Усилие рассуждения OpenAI-провайдеры передают в API нативно.
        reasoning_effort=prefs.reasoning_effort,
        # Потолок длины ответа — глобальный runaway-предохранитель.
        max_output_tokens=MAX_OUTPUT_TOKENS,
    )
    usage: dict = {}
    deltas = get_provider(mode.provider).stream(
        system=system, history=history, params=params, usage=usage
    )
    return AIStream(deltas=deltas, model=model, usage=usage)
