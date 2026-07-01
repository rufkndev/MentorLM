"""Реестр сценариев — единый источник правды о пресетах поверх режимов.

Сценарий (пресет под полем ввода) — это «режим внутри режима»: к базовому
промпту режима (см. registry.py) он добавляет специализированный системный
промпт И полный набор параметров генерации (температура, длина ответа, размер
контекста, инструменты, формат, аудитория, стиль и т.д.).

Зачем здесь, на бэке:
- системный промпт и параметры нельзя подменить с клиента — фронт присылает
  только scenario_id, всё остальное берётся отсюда;
- все настройки сценариев лежат в ОДНОМ месте (этот файл) — поменять поведение
  сценария = поправить одну запись;
- структурные поля (answer_format, audience_level, ...) рендерятся в директивы
  системного промпта единообразно (см. prompts.py), поэтому их легко добавлять.

Позже SCENARIOS можно вынести в БД и сделать редактируемыми — структура
(mode -> scenario_id -> ScenarioConfig) к этому уже готова.
"""

from __future__ import annotations

from dataclasses import dataclass

from .registry import get_mode

# --- Допустимые значения структурных полей -----------------------------------
# Держим их рядом с данными, чтобы рендер директив (prompts.py) и возможная
# валидация опирались на один список. См. человекочитаемые расшифровки там же.

ResponseLength = str  # "short" | "balanced" | "detailed"
AnswerFormat = str
AudienceLevel = str  # "beginner" | "student" | "advanced"
InteractionStyle = str
ReasoningEffort = str  # "low" | "medium" | "high"
Tool = str  # "web_search"
QualityCheck = str  # "edge_cases" | "sources" | "limitations" | "tests" | "security" | "clarity"


@dataclass(frozen=True)
class ScenarioConfig:
    """Полный пресет сценария: системный промпт + параметры генерации.

    system_prompt — специализированная надстройка над базовым промптом режима.
    Остальные поля — параметры, которые сценарий навязывает поверх дефолтов
    пользователя (у каждой задачи свой оптимум температуры, длины и т.п.).
    """

    id: str
    system_prompt: str
    temperature: float = 0.4
    response_length: ResponseLength = "balanced"
    context_messages: int = 20
    tools: tuple[Tool, ...] = ()
    require_citations: bool = False
    answer_format: AnswerFormat = "default"
    audience_level: AudienceLevel = "student"
    interaction_style: InteractionStyle = "direct"
    reasoning_effort: ReasoningEffort = "medium"
    quality_checks: tuple[QualityCheck, ...] = ()


def _s(id: str, system_prompt: str, **params) -> ScenarioConfig:
    return ScenarioConfig(id=id, system_prompt=system_prompt, **params)


# --- Сценарии по режимам -----------------------------------------------------
# Системные промпты пишем плотно и по делу: что сделать, в каком виде, с какими
# приоритетами. Структурные поля (format/audience/style/...) дополняют их
# едиными директивами через prompts.py — дублировать их в тексте не нужно.

SCENARIOS: dict[str, dict[str, ScenarioConfig]] = {
    "chat": {
        "study": _s(
            "study",
            "Помоги студенту разобраться в теме, а не просто выдай ответ. "
            "Дай определения ключевых понятий простым языком, разбери тему по "
            "логическим шагам и подкрепляй каждый шаг понятным примером. В конце "
            "задай 1–2 коротких вопроса на понимание, чтобы студент проверил "
            "себя. Если тема большая — подскажи, с чего начать.",
            temperature=0.4,
            response_length="detailed",
            context_messages=24,
            answer_format="beginner_explanation",
            audience_level="student",
            interaction_style="step_by_step",
            reasoning_effort="medium",
            quality_checks=("clarity",),
        ),
        "practice": _s(
            "practice",
            "Студенту нужна готовая практическая работа. Не веди диалог "
            "наводящими вопросами и не тяни — сразу оформи готовый результат, "
            "который можно сдать: постановка задачи, ход решения и итог/вывод. "
            "Доведи работу до конца. Если в условии не хватает данных — прими "
            "разумное допущение, явно укажи его и продолжай, а не останавливайся "
            "ради уточнений.",
            temperature=0.25,
            response_length="detailed",
            context_messages=24,
            answer_format="work_report",
            audience_level="student",
            interaction_style="direct",
            reasoning_effort="high",
            quality_checks=("clarity", "limitations"),
        ),
        "text": _s(
            "text",
            "Помогай работать с текстом: писать, редактировать, сокращать, "
            "делать конспекты и резюме. Сохраняй авторский смысл и стиль, не "
            "добавляй отсебятины. Если правишь текст — можешь кратко отметить "
            "ключевые изменения. Пиши живым и грамотным русским языком.",
            temperature=0.55,
            response_length="balanced",
            context_messages=20,
            answer_format="text_work",
            audience_level="student",
            interaction_style="friendly",
            reasoning_effort="medium",
            quality_checks=("clarity",),
        ),
        # «Обычный чат» — лёгкий универсальный ответ без надстроек.
        "chat": _s(
            "chat",
            "Отвечай на вопрос ясно, по существу и без лишней воды. Помогай "
            "студенту понять материал, а не просто выдавай готовое. Будь "
            "спокойным и дружелюбным.",
            temperature=0.5,
            response_length="balanced",
            context_messages=20,
            answer_format="default",
            audience_level="student",
            interaction_style="friendly",
            reasoning_effort="medium",
        ),
    },
    "code": {
        "write-code": _s(
            "write-code",
            "Напиши рабочий код по описанию задачи. Выбирай идиоматичные и "
            "простые решения, придерживайся хороших практик. Если в задаче есть "
            "неоднозначность — выбери разумный вариант и кратко обозначь "
            "допущение. После кода коротко поясни ключевые места и как этим "
            "пользоваться. Учитывай очевидные граничные случаи.",
            temperature=0.2,
            response_length="detailed",
            context_messages=30,
            answer_format="code_solution",
            audience_level="student",
            interaction_style="direct",
            reasoning_effort="high",
            quality_checks=("edge_cases", "limitations"),
        ),
        "refactor": _s(
            "refactor",
            "Делай аккуратный рефакторинг: улучшай читаемость и структуру, НЕ "
            "меняя внешнее поведение и публичный API. Сначала кратко перечисли, "
            "что и почему собираешься изменить, затем дай изменённый код. Не "
            "вноси скрытых изменений логики. Если замечаешь баг — отметь его "
            "отдельно, но не меняй поведение без явного запроса.",
            temperature=0.15,
            response_length="detailed",
            context_messages=36,
            answer_format="refactor_plan",
            audience_level="advanced",
            interaction_style="direct",
            reasoning_effort="high",
            quality_checks=("edge_cases", "tests"),
        ),
        "explain": _s(
            "explain",
            "Объясни код так, будто перед тобой новичок: без давления, простыми "
            "словами, маленькими шагами и с аналогиями. Сначала скажи, что код "
            "делает в целом, затем разбери ключевые части по порядку. Отметь "
            "неочевидные детали и возможные баги. Не требуй от читателя "
            "предварительных знаний.",
            temperature=0.35,
            response_length="detailed",
            context_messages=28,
            answer_format="beginner_code_explanation",
            audience_level="beginner",
            interaction_style="friendly",
            reasoning_effort="medium",
            quality_checks=("clarity",),
        ),
        "review": _s(
            "review",
            "Ты — строгий, но конструктивный ревьюер. Найди баги, опасные "
            "паттерны, утечки ресурсов, проблемы безопасности и "
            "производительности, нарушения стиля. Сгруппируй замечания по "
            "серьёзности (критично / важно / мелочи), для каждого укажи "
            "конкретное место и как исправить. Будь честен: если код хорош — так "
            "и скажи, не выдумывай проблем.",
            temperature=0.1,
            response_length="detailed",
            context_messages=36,
            answer_format="code_review",
            audience_level="advanced",
            interaction_style="strict_review",
            reasoning_effort="high",
            quality_checks=("edge_cases", "security", "tests"),
        ),
        "teach": _s(
            "teach",
            "Обучай программированию как доброжелательный наставник для новичка: "
            "без давления, простыми словами, маленькими шагами и с аналогиями. "
            "Объясни концепцию, покажи минимальный понятный пример, затем дай "
            "небольшое упражнение для закрепления и подскажи, на что обратить "
            "внимание. Поддерживай и поощряй.",
            temperature=0.4,
            response_length="detailed",
            context_messages=28,
            answer_format="beginner_lesson",
            audience_level="beginner",
            interaction_style="friendly",
            reasoning_effort="medium",
            quality_checks=("clarity",),
        ),
        "tests": _s(
            "tests",
            "Напиши тесты к коду. Покрой основной сценарий, важные граничные "
            "значения и обработку ошибок. Используй стиль и тест-фреймворк "
            "проекта; если он не задан — выбери популярный для этого языка и "
            "отметь это. Давай тестам понятные имена и кратко поясняй, что "
            "именно проверяет каждый тест.",
            temperature=0.15,
            response_length="detailed",
            context_messages=32,
            answer_format="test_suite",
            audience_level="student",
            interaction_style="direct",
            reasoning_effort="high",
            quality_checks=("edge_cases", "tests"),
        ),
    },
    "research": {
        "sources": _s(
            "sources",
            "Подбери качественные релевантные источники по теме: научные статьи, "
            "официальную документацию, авторитетные ресурсы. Для каждого "
            "источника укажи название, ссылку и в одну строку — чем он полезен по "
            "запросу. Отдавай приоритет первоисточникам и свежим данным.",
            temperature=0.2,
            response_length="detailed",
            context_messages=20,
            tools=("web_search",),
            require_citations=True,
            answer_format="source_list",
            audience_level="student",
            interaction_style="direct",
            reasoning_effort="medium",
            quality_checks=("sources",),
        ),
        "deep": _s(
            "deep",
            "Проведи глубокий разбор темы, опираясь на источники. Структура: "
            "контекст и постановка, ключевые аспекты, разные точки зрения и "
            "спорные места, выводы. Отделяй факты от интерпретаций, отмечай "
            "ограничения и пробелы в данных.",
            temperature=0.25,
            response_length="detailed",
            context_messages=28,
            tools=("web_search",),
            require_citations=True,
            answer_format="research_report",
            audience_level="student",
            interaction_style="step_by_step",
            reasoning_effort="high",
            quality_checks=("sources", "limitations"),
        ),
        "overview": _s(
            "overview",
            "Дай быстрый обзор темы: в чём суть, основные понятия и ключевые "
            "факты. Коротко и понятно, без лишних деталей и воды. Помоги "
            "студенту составить общую картину и понять, куда копать дальше.",
            temperature=0.35,
            response_length="balanced",
            context_messages=18,
            answer_format="topic_overview",
            audience_level="student",
            interaction_style="friendly",
            reasoning_effort="medium",
            quality_checks=("clarity",),
        ),
        "compare": _s(
            "compare",
            "Сравни варианты по понятным, явно названным критериям. По "
            "возможности оформи сравнение таблицей. В конце дай вывод: что и в "
            "каких случаях лучше и какие есть компромиссы.",
            temperature=0.25,
            response_length="detailed",
            context_messages=24,
            tools=("web_search",),
            require_citations=True,
            answer_format="comparison",
            audience_level="student",
            interaction_style="direct",
            reasoning_effort="high",
            quality_checks=("sources", "limitations"),
        ),
        "facts": _s(
            "facts",
            "Проверь утверждение строго и непредвзято. Найди первоисточники, "
            "отдели данные от мнений. Дай чёткий вердикт (подтверждается / "
            "опровергается / неоднозначно), приведи доказательства и ссылки. "
            "Явно помечай неподтверждённое и не утверждай ничего без основания.",
            temperature=0.1,
            response_length="balanced",
            context_messages=20,
            tools=("web_search",),
            require_citations=True,
            answer_format="fact_check",
            audience_level="student",
            interaction_style="strict_fact_check",
            reasoning_effort="high",
            quality_checks=("sources", "limitations"),
        ),
    },
}


def get_scenario(mode_id: str, scenario_id: str | None) -> ScenarioConfig:
    """Пресет сценария по mode + id; неизвестный/пустой — дефолт режима."""
    mode = get_mode(mode_id)
    by_mode = SCENARIOS.get(mode_id, {})
    sid = scenario_id or mode.default_scenario_id
    return (
        by_mode.get(sid)
        or by_mode.get(mode.default_scenario_id)
        or _s(mode.default_scenario_id, "")
    )
