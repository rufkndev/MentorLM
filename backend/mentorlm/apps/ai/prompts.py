"""Сборка системного промпта на бэке.

Системный промпт = базовый промпт режима + промпт сценария (из реестра, не из
запроса!) + персонализация пользователя. Фронт присылает только scenario_id.
"""

from __future__ import annotations

from .registry import get_mode
from .scenarios import get_scenario_prompt


def _persona_parts(user_settings) -> list[str]:
    """Персонализация из настроек пользователя — добавляется к каждому ответу."""
    persona: list[str] = []
    if getattr(user_settings, "nickname", ""):
        persona.append(
            f"Обращайся к пользователю по имени: {user_settings.nickname}."
        )
    if getattr(user_settings, "occupation", ""):
        persona.append(f"Род занятий пользователя: {user_settings.occupation}.")
    if getattr(user_settings, "custom_about", ""):
        persona.append(f"О пользователе: {user_settings.custom_about}")
    if getattr(user_settings, "custom_style", ""):
        persona.append(
            f"Предпочтительный стиль ответов: {user_settings.custom_style}"
        )
    if not persona:
        return []
    return ["\n".join(persona)]


def build_system_prompt(mode_id: str, scenario_id: str | None, user_settings) -> str:
    """Системный промпт = база режима + сценарий + персонализация пользователя."""
    mode = get_mode(mode_id)
    parts = [
        mode.base_system_prompt,
        get_scenario_prompt(mode_id, scenario_id),
        *_persona_parts(user_settings),
    ]
    return "\n\n".join(p for p in parts if p)
