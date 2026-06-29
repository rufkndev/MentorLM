"""Единый реестр режимов MentorLM.

Одно место, где задаются провайдер, модель, базовый системный промпт и
дефолтный сценарий каждого режима. Чтобы поменять модель или промпт режима —
правим только здесь. Структура из dataclass'ов в коде сознательно простая: для
трёх режимов БД-конфиг/плагины были бы преждевременным усложнением, но вынести
это в БД позже не составит труда.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings

# --- Базовые системные промпты режимов ---------------------------------------

# Режим «Общий» (chat). Интерфейс рендерит Markdown, поэтому разметка разрешена.
CHAT_PROMPT = (
    "Ты — MentorLM, доброжелательный ИИ-ассистент для учёбы российских "
    "студентов. Отвечай по-русски, ясно и по существу, помогай разбираться "
    "в материале, а не просто давай готовый ответ. "
    "Используй умеренное Markdown-форматирование, когда это улучшает "
    "читаемость: выделение ключевых терминов (**жирным**), списки, заголовки, "
    "блоки кода для кода и формул. Не перегружай разметкой простые ответы."
)

# Режим «Код» (code) — Claude Sonnet. Здесь Markdown и блоки кода уместны.
CODE_PROMPT = (
    "Ты — MentorLM в режиме «Код»: ассистент по программированию для российских "
    "студентов. Помогай писать, объяснять, рефакторить и тестировать код. "
    "Отвечай по-русски. Объясняй ключевые решения кратко и по делу, выбирай "
    "идиоматичные подходы и указывай на возможные баги и подводные камни. "
    "Код оформляй в Markdown-блоках с указанием языка; пояснения — обычным текстом."
)

# Режим «Исследовать» (research) — GPT + web_search. Опора на актуальные источники.
RESEARCH_PROMPT = (
    "Ты — MentorLM в режиме «Исследовать»: помощник по поиску и анализу "
    "информации для российских студентов. У тебя есть доступ к веб-поиску — "
    "опирайся на актуальные источники, а не только на свои знания, особенно для "
    "свежих событий, цифр и версий. Отвечай по-русски, отделяй факты от мнений, "
    "помечай неподтверждённое и будь точен. Отвечай по существу заданного вопроса."
)


# --- Конфигурация режима ------------------------------------------------------


@dataclass(frozen=True)
class ModeConfig:
    """Описание одного режима: чем и как отвечаем."""

    id: str  # "chat" | "code" | "research"
    provider: str  # ключ провайдера: "openai_chat" | "anthropic" | "openai_research"
    model: str  # реальный id модели
    base_system_prompt: str
    default_scenario_id: str
    web_search: bool = False


def _modes() -> dict[str, ModeConfig]:
    """Собираем реестр лениво, чтобы читать модели из settings на момент вызова."""
    return {
        "chat": ModeConfig(
            id="chat",
            provider="openai_chat",
            model=settings.OPENAI_CHAT_MODEL,
            base_system_prompt=CHAT_PROMPT,
            default_scenario_id="chat",
        ),
        "code": ModeConfig(
            id="code",
            provider="anthropic",
            model=settings.ANTHROPIC_CODE_MODEL,
            base_system_prompt=CODE_PROMPT,
            default_scenario_id="write-code",
        ),
        "research": ModeConfig(
            id="research",
            provider="openai_research",
            model=settings.OPENAI_RESEARCH_MODEL,
            base_system_prompt=RESEARCH_PROMPT,
            default_scenario_id="overview",
            web_search=True,
        ),
    }


def get_mode(mode_id: str) -> ModeConfig:
    """Конфиг режима по id; неизвестный режим — фолбэк на «Общий»."""
    modes = _modes()
    return modes.get(mode_id, modes["chat"])
