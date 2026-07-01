"""Сборка системного промпта на бэке.

Системный промпт = базовый промпт режима + промпт сценария + директивы из
структурных полей сценария (формат/аудитория/стиль/...) + персонализация
пользователя. Фронт присылает только scenario_id — текст промпта он не задаёт.

Структурные поля сценария (answer_format, audience_level, interaction_style,
reasoning_effort, quality_checks, require_citations) превращаются в короткие
русские директивы здесь, в одном месте: добавить новое значение поля = дописать
строку в соответствующий словарь.
"""

from __future__ import annotations

from .registry import get_mode
from .scenarios import ScenarioConfig, get_scenario

# --- Расшифровки структурных полей в директивы -------------------------------

_ANSWER_FORMAT: dict[str, str] = {
    "default": "",
    "beginner_explanation": "Формат: объяснение для новичка — простыми словами, с аналогиями и небольшими шагами.",
    "work_report": "Формат: готовая практическая работа — оформленный результат, который можно сдать (постановка, ход решения, вывод).",
    "text_work": "Формат: готовый текстовый материал (текст, конспект или резюме) в нужном стиле.",
    "code_solution": "Формат: рабочее решение с кодом и кратким пояснением ключевых мест.",
    "refactor_plan": "Формат: сначала план изменений (что и почему), затем изменённый код.",
    "beginner_code_explanation": "Формат: пошаговый разбор кода для новичка.",
    "code_review": "Формат: ревью — замечания, сгруппированные по серьёзности, с конкретными рекомендациями.",
    "beginner_lesson": "Формат: учебный мини-урок — теория, пример, упражнение.",
    "test_suite": "Формат: набор тестов с понятными именами и пояснением, что проверяет каждый.",
    "source_list": "Формат: список источников — название, ссылка и краткое описание релевантности.",
    "research_report": "Формат: структурированный аналитический отчёт с разделами и выводами.",
    "topic_overview": "Формат: краткий обзор — суть и ключевые понятия без лишних деталей.",
    "comparison": "Формат: сравнение по критериям (по возможности таблицей) с итоговым выводом.",
    "fact_check": "Формат: проверка факта — вердикт, доказательства и ссылки на первоисточники.",
}

_RESPONSE_LENGTH: dict[str, str] = {
    "short": "Длина: кратко — только суть, без воды (но не обрывай мысль).",
    "balanced": "Длина: умеренно — достаточно, чтобы раскрыть вопрос.",
    "detailed": "Длина: подробно — раскрой тему полно, доводи ответ до конца.",
}

_AUDIENCE_LEVEL: dict[str, str] = {
    "beginner": "Аудитория: новичок — не предполагай предварительных знаний, расшифровывай термины.",
    "student": "Аудитория: студент — базовая терминология допустима, но поясняй сложное.",
    "advanced": "Аудитория: продвинутый — можно опускать азы и говорить по существу.",
}

_INTERACTION_STYLE: dict[str, str] = {
    "direct": "Стиль: сразу давай результат по делу, без лишних вступлений.",
    "friendly": "Стиль: доброжелательно и поддерживающе, без давления.",
    "step_by_step": "Стиль: веди последовательно, по шагам.",
    "strict_review": "Стиль: строгий, но конструктивный ревьюер — честно указывай на проблемы.",
    "strict_fact_check": "Стиль: строгий проверяющий — ничего не утверждай без подтверждения.",
}

_REASONING_EFFORT: dict[str, str] = {
    "low": "Глубина: отвечай быстро и по существу.",
    "medium": "Глубина: продумай ответ, но без избыточности.",
    "high": "Глубина: тщательно продумай решение до ответа.",
}

_QUALITY_CHECK: dict[str, str] = {
    "edge_cases": "граничные случаи",
    "sources": "наличие и качество источников",
    "limitations": "ограничения и допущения",
    "tests": "корректность на примерах",
    "security": "вопросы безопасности",
    "clarity": "ясность и понятность",
}


def _scenario_directives(scenario: ScenarioConfig) -> str:
    """Структурные поля сценария → блок коротких директив (или пусто)."""
    lines: list[str] = []

    fmt = _ANSWER_FORMAT.get(scenario.answer_format, "")
    if fmt:
        lines.append(fmt)

    if scenario.response_length in _RESPONSE_LENGTH:
        lines.append(_RESPONSE_LENGTH[scenario.response_length])
    if scenario.audience_level in _AUDIENCE_LEVEL:
        lines.append(_AUDIENCE_LEVEL[scenario.audience_level])
    if scenario.interaction_style in _INTERACTION_STYLE:
        lines.append(_INTERACTION_STYLE[scenario.interaction_style])
    if scenario.reasoning_effort in _REASONING_EFFORT:
        lines.append(_REASONING_EFFORT[scenario.reasoning_effort])

    if scenario.require_citations:
        lines.append(
            "Подкрепляй ключевые утверждения ссылками на источники."
        )

    checks = [
        _QUALITY_CHECK[c] for c in scenario.quality_checks if c in _QUALITY_CHECK
    ]
    if checks:
        lines.append("Перед ответом проверь: " + ", ".join(checks) + ".")

    return "\n".join(lines)


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
    """Системный промпт = база режима + сценарий + директивы + персонализация."""
    mode = get_mode(mode_id)
    scenario = get_scenario(mode_id, scenario_id)
    parts = [
        mode.base_system_prompt,
        scenario.system_prompt,
        _scenario_directives(scenario),
        *_persona_parts(user_settings),
    ]
    return "\n\n".join(p for p in parts if p)
