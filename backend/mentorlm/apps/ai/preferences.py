"""Пользовательские AI-настройки и их согласование со сценарием — одно место.

Здесь собрано ВСЁ, что касается настроек «Модель ИИ» и «Память» из ЛК:

1. Канонические варианты и дефолты каждой настройки (`*_CHOICES`, `DEFAULTS`) —
   их импортирует модель `UserSettings`, чтобы choices/дефолты не расходились.
2. Маппинг продуктового выбора модели (default/fast/quality) в реальный id.
3. Главное — правила СОГЛАСОВАНИЯ настроек со сценарием. Настройка пользователя
   не перекрывает сценарий и не перекрывается им: это мягкий сдвиг в границах,
   которые задаёт сценарий (а бюджет контекста ещё и тариф).

Слои, от жёсткого к мягкому:
    тариф (потолок токенов) > сценарий (база и границы) > настройка юзера (сдвиг)

Почему отдельным модулем, а не в моделях/промптах: параметры генерации,
маппинг моделей и текстовые директивы должны согласовываться по одним и тем же
правилам. Держим их рядом, чтобы менять поведение в одной точке.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from django.conf import settings

from .registry import ModeConfig
from .scenarios import ScenarioConfig

# Канонические варианты настроек (единый источник для модели, API и валидации)
# Формат (value, human_label) — совместим с Django `choices`.

# — «Модель ИИ» —
MODEL_TIER_CHOICES = [
    ("default", "Стандартная"),
    ("fast", "Быстрая"),
    ("quality", "Максимальная"),
]
CREATIVITY_CHOICES = [
    ("precise", "Точный"),
    ("balanced", "Сбалансированный"),
    ("creative", "Творческий"),
]
RESPONSE_LENGTH_PREF_CHOICES = [
    ("shorter", "Короче"),
    ("default", "Как в сценарии"),
    ("longer", "Подробнее"),
]
REASONING_DEPTH_CHOICES = [
    ("fast", "Быстро"),
    ("auto", "Авто"),
    ("deep", "Тщательно"),
]

# — «Память» —
EDUCATION_LEVEL_CHOICES = [
    ("", "Не указано"),
    ("school", "Школа"),
    ("college", "Колледж / СПО"),
    ("bachelor", "Бакалавриат"),
    ("master", "Магистратура"),
    ("postgraduate", "Аспирантура"),
    ("other", "Другое"),
]
CONTEXT_DEPTH_CHOICES = [
    ("compact", "Компактно"),
    ("normal", "Обычно"),
    ("deep", "Глубоко"),
    ("maximum", "Максимум"),
]
MEMORY_SCOPE_CHOICES = [
    ("minimal", "Минимальный"),
    ("balanced", "Сбалансированный"),
    ("detailed", "Подробный"),
]
MEMORY_USE_CHOICES = [
    ("off", "Не использовать"),
    ("auto", "Автоматически"),
    ("always", "Всегда"),
]

# — «Данные» —
# Автоудаление старых диалогов. 0 — не удалять. Значения в днях.
RETENTION_CHOICES = [
    (0, "Не удалять"),
    (30, "Старше 30 дней"),
    (90, "Старше 90 дней"),
    (180, "Старше 180 дней"),
]

# Дефолты пользовательских AI-настроек. Дублируются во фронтовом
# DEFAULT_SETTINGS — при изменении править оба места.
DEFAULTS = {
    "chat_model": "default",
    "code_model": "default",
    "research_model": "default",
    "creativity": "balanced",
    "response_length_preference": "default",
    "reasoning_depth": "auto",
    "education_level": "",
    "field_of_study": "",
    "learning_goals": "",
    "context_depth": "normal",
    "auto_memory": True,
    "memory_scope": "balanced",
    "memory_use": "auto",
    "chat_retention_days": 0,
}


# Маппинг продуктового выбора модели → реальный id

# Поле настроек, из которого берётся тир для каждого режима.
_MODE_TIER_FIELD = {
    "chat": "chat_model",
    "code": "code_model",
    "research": "research_model",
}


def _tier_map() -> dict[str, dict[str, str]]:
    """Тиры моделей по режимам. Читаем settings лениво (как registry)."""

    def tiers(base: str, fast: str, quality: str) -> dict[str, str]:
        # Пустой env-тир откатывается на базовую модель режима.
        return {
            "default": base,
            "fast": fast or base,
            "quality": quality or base,
        }

    return {
        "chat": tiers(
            settings.OPENAI_CHAT_MODEL,
            settings.OPENAI_CHAT_MODEL_FAST,
            settings.OPENAI_CHAT_MODEL_QUALITY,
        ),
        "code": tiers(
            settings.ANTHROPIC_CODE_MODEL,
            settings.ANTHROPIC_CODE_MODEL_FAST,
            settings.ANTHROPIC_CODE_MODEL_QUALITY,
        ),
        "research": tiers(
            settings.OPENAI_RESEARCH_MODEL,
            settings.OPENAI_RESEARCH_MODEL_FAST,
            settings.OPENAI_RESEARCH_MODEL_QUALITY,
        ),
    }


def resolve_model(mode: ModeConfig, user_settings) -> str:
    """Реальный id модели: продуктовый тир юзера для этого режима → id.

    Неизвестный/пустой тир и режим без карты откатываются на модель реестра.
    """
    tier_field = _MODE_TIER_FIELD.get(mode.id)
    tier = (getattr(user_settings, tier_field, "") or "default") if tier_field else "default"
    by_mode = _tier_map().get(mode.id, {})
    return by_mode.get(tier) or mode.model


# Согласование настроек со сценарием

# Порядковые шкалы, по которым сдвигаем мягкие настройки.
_LENGTH_LEVELS = ["short", "balanced", "detailed"]
_EFFORT_LEVELS = ["low", "medium", "high"]

_CREATIVITY_DELTA = {"precise": -0.15, "balanced": 0.0, "creative": 0.15}
_LENGTH_SHIFT = {"shorter": -1, "default": 0, "longer": 1}
_DEPTH_SHIFT = {"fast": -1, "auto": 0, "deep": 1}
# Множитель к числу сообщений памяти. maximum намеренно большой — реальный
# потолок всё равно ставит бюджет токенов тарифа (см. build_context).
_CONTEXT_MULT = {"compact": 0.5, "normal": 1.0, "deep": 1.6, "maximum": 4.0}

# Форматы-«отчёты»: готовый оформленный результат нельзя ужимать до «short»,
# иначе сценарий перестанет выполнять свою задачу. Поэтому для них пол длины —
# «balanced» независимо от настройки «короче».
_REPORT_FORMATS = {
    "work_report",
    "research_report",
    "code_review",
    "refactor_plan",
    "comparison",
    "test_suite",
    "source_list",
    "fact_check",
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _shift_level(levels: list[str], current: str, delta: int, floor_idx: int = 0) -> str:
    """Сдвиг по порядковой шкале с зажатием в [floor_idx, len-1]."""
    try:
        idx = levels.index(current)
    except ValueError:
        return current
    idx = int(_clamp(idx + delta, floor_idx, len(levels) - 1))
    return levels[idx]


def _resolve_temperature(scenario: ScenarioConfig, creativity: str) -> float:
    """Температура сценария + сдвиг стиля, зажатая в границы сценария.

    Границы берём из сценария, если заданы; иначе — окно ±0.2 вокруг базовой
    температуры (низкотемпературные сценарии так и остаются дисциплинированными).
    """
    base = scenario.temperature
    low = scenario.temperature_min
    high = scenario.temperature_max
    if low is None:
        low = max(0.0, base - 0.2)
    if high is None:
        high = min(1.0, base + 0.2)
    return round(_clamp(base + _CREATIVITY_DELTA.get(creativity, 0.0), low, high), 3)


def _resolve_length(scenario: ScenarioConfig, preference: str) -> str:
    floor_idx = (
        _LENGTH_LEVELS.index("balanced")
        if scenario.answer_format in _REPORT_FORMATS
        else 0
    )
    return _shift_level(
        _LENGTH_LEVELS, scenario.response_length,
        _LENGTH_SHIFT.get(preference, 0), floor_idx,
    )


def _resolve_effort(scenario: ScenarioConfig, depth: str) -> str:
    return _shift_level(
        _EFFORT_LEVELS, scenario.reasoning_effort, _DEPTH_SHIFT.get(depth, 0)
    )


def _resolve_context_messages(scenario: ScenarioConfig, context_depth: str) -> int:
    mult = _CONTEXT_MULT.get(context_depth, 1.0)
    return max(2, round(scenario.context_messages * mult))


def _persona(user_settings) -> list[str]:
    """Строки персонализации из полей «Память» → директивы системного промпта.

    Настройки auto_memory/memory_scope/memory_use здесь НЕ участвуют: хранилища
    сохранённых фактов в MVP ещё нет, они управляют будущей автопамятью, а не
    текущим промптом.
    """
    lines: list[str] = []

    def val(name: str) -> str:
        return (getattr(user_settings, name, "") or "").strip()

    if val("nickname"):
        lines.append(f"Обращайся к пользователю по имени: {val('nickname')}.")
    if val("occupation"):
        lines.append(f"Род занятий пользователя: {val('occupation')}.")

    level = val("education_level")
    level_label = dict(EDUCATION_LEVEL_CHOICES).get(level, "")
    if level and level_label:
        lines.append(f"Уровень обучения: {level_label.lower()}.")
    if val("field_of_study"):
        lines.append(f"Направление/специальность: {val('field_of_study')}.")
    if val("learning_goals"):
        lines.append(f"Цели обучения: {val('learning_goals')}")
    if val("custom_about"):
        lines.append(f"О пользователе: {val('custom_about')}")
    if val("custom_style"):
        lines.append(f"Предпочтительный стиль ответов: {val('custom_style')}")

    if not lines:
        return []
    return ["\n".join(lines)]


@dataclass(frozen=True)
class ResolvedPreferences:
    """Итог согласования настроек юзера со сценарием — вход для промпта и вызова.

    Всё, что дальше нужно провайдеру и сборке промпта, уже посчитано здесь по
    единым правилам: модель, температура, длина/усилие (после мягкого сдвига),
    объём памяти и строки персонализации.
    """

    model: str
    temperature: float
    response_length: str
    reasoning_effort: str
    context_messages: int
    persona: list[str] = field(default_factory=list)


def resolve_preferences(
    mode: ModeConfig, scenario: ScenarioConfig, user_settings
) -> ResolvedPreferences:
    """Свести настройки пользователя со сценарием по правилам согласования."""
    creativity = getattr(user_settings, "creativity", DEFAULTS["creativity"])
    length_pref = getattr(
        user_settings, "response_length_preference",
        DEFAULTS["response_length_preference"],
    )
    depth = getattr(user_settings, "reasoning_depth", DEFAULTS["reasoning_depth"])
    context_depth = getattr(
        user_settings, "context_depth", DEFAULTS["context_depth"]
    )

    return ResolvedPreferences(
        model=resolve_model(mode, user_settings),
        temperature=_resolve_temperature(scenario, creativity),
        response_length=_resolve_length(scenario, length_pref),
        reasoning_effort=_resolve_effort(scenario, depth),
        context_messages=_resolve_context_messages(scenario, context_depth),
        persona=_persona(user_settings),
    )
