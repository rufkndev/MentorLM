"""Контекст диалога и подсчёт токенов — провайдеро-независимая часть.

Перенос из старого conversations/services.py. Строит «память» диалога (историю
сообщений в пределах лимитов) и оценивает число токенов для обрезки контекста.
"""

from __future__ import annotations

from .registry import ModeConfig

try:  # tiktoken не критичен — при отсутствии считаем токены грубой оценкой
    import tiktoken
except Exception:  # pragma: no cover - окружение без tiktoken
    tiktoken = None


# Сколько токенов максимум просим у модели в зависимости от длины ответа.
RESPONSE_MAX_TOKENS = {
    "short": 512,
    "balanced": 1024,
    "detailed": 2048,
}


def _encoding(model: str):
    if tiktoken is None:
        return None
    try:
        return tiktoken.encoding_for_model(model)
    except Exception:
        try:
            return tiktoken.get_encoding("o200k_base")
        except Exception:
            return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str, model: str) -> int:
    """Число токенов в тексте; при отсутствии tiktoken — грубая оценка.

    Для не-OpenAI моделей tiktoken даёт лишь приближение, но для обрезки
    контекста по бюджету этого достаточно.
    """
    enc = _encoding(model)
    if enc is None:
        # ~4 символа на токен — достаточно для обрезки контекста.
        return max(1, len(text) // 4)
    return len(enc.encode(text))


def resolve_model(mode: ModeConfig, user_settings) -> str:
    """Реальный id модели режима.

    Для режима «Общий» уважаем выбор пользователя в настройках, если это похоже
    на OpenAI-модель (default_model хранит и продуктовые плейсхолдеры). Для
    остальных режимов модель задаёт реестр — её нельзя переопределить из настроек.
    """
    if mode.provider == "openai_chat":
        chosen = (getattr(user_settings, "default_model", "") or "").strip()
        if chosen.startswith("gpt-"):
            return chosen
    return mode.model


def build_context(conversation, user_settings, plan_limits, *, model: str) -> list[dict]:
    """История диалога для модели — «память» чата.

    Берём сообщения по порядку, оставляем последние N (context_size) и обрезаем
    по бюджету токенов тарифа. System-промпт добавляет провайдер/вьюха отдельно.
    """
    try:
        max_messages = int(user_settings.context_size)
    except (TypeError, ValueError):
        max_messages = 20

    token_budget = plan_limits.get("context_tokens") or 8_000

    qs = list(conversation.messages.order_by("created_at"))
    recent = qs[-max_messages:] if max_messages > 0 else qs

    # Идём с конца и набираем сообщения, пока укладываемся в бюджет токенов.
    selected: list[dict] = []
    used = 0
    for msg in reversed(recent):
        cost = count_tokens(msg.content, model)
        if selected and used + cost > token_budget:
            break
        selected.append({"role": msg.role, "content": msg.content})
        used += cost
    selected.reverse()
    return selected
