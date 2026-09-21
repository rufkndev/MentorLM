"""Настройки пользователя «Модель ИИ» и «Память» и их согласование со сценарием.

Здесь и канонические варианты/дефолты настроек (их импортирует `UserSettings`),
и правила слоёв: тариф — потолок, сценарий — база и границы, настройка — мягкий
сдвиг внутри них.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .registry import ModeConfig
from .sanitize import clean_prompt_text, wrap_untrusted
from .scenarios import ScenarioConfig

# ── Канонические варианты настроек ────────────────────────────────────────────
# Единый источник для модели БД, API и валидации. Формат (значение, подпись)
# совместим с Django `choices`.

# «Модель ИИ»
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

# «Память»
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

# Свободные поля «о себе»: потолок длины в символах.
#
# Это не про удобство формы, а про безопасность и деньги. Текст этих полей
# уходит в СИСТЕМНЫЙ промпт на каждом запросе, а preflight (apps.billing.guard)
# считает токены только сообщения и вложений — системный промпт он не видит.
# Значит без потолка здесь «рассказ о себе» на мегабайт ехал бы в модель мимо
# MAX_INPUT_TOKENS, и он же был бы удобным местом для длинной инъекции.
# Значения зеркалит фронт: frontend/mentorlm/src/lib/settings-contents.ts.
PERSONA_LIMITS: dict[str, int] = {
    "nickname": 50,
    "occupation": 100,
    "field_of_study": 120,
    "learning_goals": 600,
    "custom_about": 1500,
    "custom_style": 1000,
}

# «Данные»: автоудаление диалогов, в днях (0 — не удалять).
RETENTION_CHOICES = [
    (0, "Не удалять"),
    (30, "Старше 30 дней"),
    (90, "Старше 90 дней"),
    (180, "Старше 180 дней"),
]

# Дефолты настроек. Дублируются во фронтовом DEFAULT_SETTINGS — менять оба места.
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
    # 30 дней — срок, обещанный в юр-документах; меняется на вкладке «Данные».
    "chat_retention_days": 30,
}


# ── Продуктовый тир модели → реальный id ──────────────────────────────────────


def resolve_model(mode: ModeConfig, user_settings) -> str:
    """Реальный id модели по тиру юзера; неизвестный тир — стандартная модель.

    Карта «режим → тир → модель» живёт в каталоге (`billing.limits.MODES`), там
    же, где цены. Импорт ленивый: этот модуль грузится из `apps.users.models`,
    раньше приложения billing (подробнее — в `ai.registry._modes`).
    """
    from apps.billing.limits import mode_models

    cfg = mode_models(mode.id)
    tier = getattr(user_settings, cfg.tier_field, "") or "default"
    return cfg.model(tier) or mode.model


# ── Согласование настроек со сценарием ────────────────────────────────────────

# Порядковые шкалы, по которым двигаются мягкие настройки.
_LENGTH_LEVELS = ["short", "balanced", "detailed"]
_EFFORT_LEVELS = ["low", "medium", "high"]

# Насколько настройка сдвигает базу сценария (шаг по шкале / дельта температуры).
_CREATIVITY_DELTA = {"precise": -0.15, "balanced": 0.0, "creative": 0.15}
_LENGTH_SHIFT = {"shorter": -1, "default": 0, "longer": 1}
_DEPTH_SHIFT = {"fast": -1, "auto": 0, "deep": 1}
# Множитель к числу сообщений предыстории. maximum намеренно большой — потолок
# всё равно ставит тариф (context_messages плана, см. ai.service).
_CONTEXT_MULT = {"compact": 0.5, "normal": 1.0, "deep": 1.6, "maximum": 4.0}

# Форматы-«отчёты»: готовый оформленный результат нельзя ужимать до «short» —
# сценарий перестанет выполнять свою задачу. Для них пол длины — «balanced».
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
    """Зажать значение в границы."""
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
    """Температура сценария со сдвигом «Креативности», зажатая в его границы.

    Границы — из сценария, а если не заданы, окно ±0.2 вокруг базы: строгие
    сценарии остаются строгими при любой настройке.
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
    """Длина ответа: база сценария + настройка, не ниже пола для форматов-отчётов."""
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
    """Усилие рассуждения: база сценария + настройка «Глубина ответа»."""
    return _shift_level(
        _EFFORT_LEVELS, scenario.reasoning_effort, _DEPTH_SHIFT.get(depth, 0)
    )


def _resolve_context_messages(scenario: ScenarioConfig, context_depth: str) -> int:
    """Длина предыстории: база сценария × множитель «Глубины контекста»."""
    mult = _CONTEXT_MULT.get(context_depth, 1.0)
    return max(2, round(scenario.context_messages * mult))


def _persona(user_settings) -> list[str]:
    """Поля «о пользователе» → строки персонализации для системного промпта.

    Только то, что пользователь указал сам. Автопамять (auto_memory /
    memory_scope / memory_use) сюда не входит — она живёт в apps.memory.

    Весь текст проходит через ai.sanitize — это второй рубеж после сериализатора
    (apps.users.serializers). Он нужен для строк, записанных до появления
    лимитов, и для любого будущего пути записи мимо API: промпт не должен
    зависеть от того, кто и как положил значение в базу.
    """
    lines: list[str] = []

    def val(name: str) -> str:
        raw = getattr(user_settings, name, "") or ""
        return clean_prompt_text(raw, limit=PERSONA_LIMITS[name], max_lines=1)

    if val("nickname"):
        lines.append(f"Обращайся к пользователю по имени: {val('nickname')}.")
    if val("occupation"):
        lines.append(f"Род занятий пользователя: {val('occupation')}.")

    level = (getattr(user_settings, "education_level", "") or "").strip()
    level_label = dict(EDUCATION_LEVEL_CHOICES).get(level, "")
    if level and level_label:
        lines.append(f"Уровень обучения: {level_label.lower()}.")
    if val("field_of_study"):
        lines.append(f"Направление/специальность: {val('field_of_study')}.")

    # Длинные поля — многострочные, поэтому каждому свой блок с делимитером:
    # модель должна видеть, где кончается наша инструкция и начинается текст,
    # который написал пользователь.
    blocks: list[str] = []
    for name, title in (
        ("learning_goals", "цели обучения"),
        ("custom_about", "о пользователе"),
        ("custom_style", "предпочтительный стиль ответов"),
    ):
        raw = getattr(user_settings, name, "") or ""
        block = wrap_untrusted(
            "user_data",
            clean_prompt_text(raw, limit=PERSONA_LIMITS[name]),
            name=title,
        )
        if block:
            blocks.append(block)

    if lines:
        blocks.insert(0, "\n".join(lines))
    if not blocks:
        return []
    return ["\n".join(blocks)]


@dataclass(frozen=True)
class ResolvedPreferences:
    """Итог согласования: всё, что нужно промпту и вызову модели, уже посчитано."""

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
