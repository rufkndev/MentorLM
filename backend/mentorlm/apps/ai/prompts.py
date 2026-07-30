"""Сборка системного промпта: режим + сценарий + директивы + персонализация.

Структурные поля сценария превращаются в короткие русские директивы здесь —
добавить новое значение поля значит дописать строку в словарь ниже.
"""

from __future__ import annotations

from .preferences import ResolvedPreferences
from .registry import get_mode
from .scenarios import ScenarioConfig

# ── Расшифровки структурных полей сценария в директивы ────────────────────────
# Ключи совпадают со значениями полей ScenarioConfig; пустая строка = без строки.

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

# Длина и глубина приходят из prefs (сценарий + сдвиг настройкой), не из сценария.
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

# Собираются в одну строку «Перед ответом проверь: ...».
_QUALITY_CHECK: dict[str, str] = {
    "edge_cases": "граничные случаи",
    "sources": "наличие и качество источников",
    "limitations": "ограничения и допущения",
    "tests": "корректность на примерах",
    "security": "вопросы безопасности",
    "clarity": "ясность и понятность",
}


def _scenario_directives(
    scenario: ScenarioConfig, prefs: ResolvedPreferences
) -> str:
    """Структурные поля сценария → блок коротких директив (или пустая строка).

    Длину и глубину берём из `prefs` (уже согласованы с настройками юзера),
    остальные поля — из самого сценария.
    """
    lines: list[str] = []

    fmt = _ANSWER_FORMAT.get(scenario.answer_format, "")
    if fmt:
        lines.append(fmt)

    if prefs.response_length in _RESPONSE_LENGTH:
        lines.append(_RESPONSE_LENGTH[prefs.response_length])
    if scenario.audience_level in _AUDIENCE_LEVEL:
        lines.append(_AUDIENCE_LEVEL[scenario.audience_level])
    if scenario.interaction_style in _INTERACTION_STYLE:
        lines.append(_INTERACTION_STYLE[scenario.interaction_style])
    if prefs.reasoning_effort in _REASONING_EFFORT:
        lines.append(_REASONING_EFFORT[prefs.reasoning_effort])

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


def build_system_prompt(
    mode_id: str,
    scenario: ScenarioConfig,
    prefs: ResolvedPreferences,
    memory_block: str = "",
) -> str:
    """Системный промпт целиком: база режима, сценарий, директивы, персонализация.

    `memory_block` — факты глобальной памяти (apps.memory), пустой блок просто
    не добавляется.
    """
    mode = get_mode(mode_id)
    parts = [
        mode.base_system_prompt,
        scenario.system_prompt,
        _scenario_directives(scenario, prefs),
        *prefs.persona,
        memory_block,
    ]
    return "\n\n".join(p for p in parts if p)
