"""Контекст диалога и подсчёт токенов — провайдеро-независимая часть.

Строит «память» диалога (историю сообщений в пределах лимитов) и оценивает число токенов для обрезки контекста.
"""

from __future__ import annotations

try:  # tiktoken не критичен — при отсутствии считаем токены грубой оценкой
    import tiktoken
except Exception:  # pragma: no cover - окружение без tiktoken
    tiktoken = None


# Потолок длины ответа — ТОЛЬКО защита от runaway, а НЕ инструмент управления
# длиной. Поставлен заведомо высоко, чтобы ответ никогда не обрывался на
# полуслове ни в одном режиме/сценарии. Желаемую длину задаём мягко, через
# промпт (response_length → директива в prompts.py), а не жёсткой обрезкой.
MAX_OUTPUT_TOKENS = 16384


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


def build_context(
    conversation, plan_limits, *, model: str, max_messages: int = 20
) -> list[dict]:
    """История диалога для модели — «память» чата.

    Берём сообщения по порядку, оставляем последние N (max_messages — из
    сценария) и обрезаем по бюджету токенов тарифа. System-промпт добавляет
    провайдер/вьюха отдельно.
    """
    try:
        max_messages = int(max_messages)
    except (TypeError, ValueError):
        max_messages = 20

    token_budget = plan_limits.get("context_tokens") or 8_000

    # prefetch вложений — их извлечённый текст подмешиваем в контент сообщения,
    # чтобы модель «видела» прикреплённые файлы (в текущем и прошлых ходах).
    qs = list(
        conversation.messages.prefetch_related("attachments").order_by("created_at")
    )
    recent = qs[-max_messages:] if max_messages > 0 else qs

    # Идём с конца и набираем сообщения, пока укладываемся в бюджет токенов.
    selected: list[dict] = []
    used = 0
    for msg in reversed(recent):
        content = _content_with_attachments(msg)
        cost = count_tokens(content, model)
        if selected and used + cost > token_budget:
            break
        selected.append({"role": msg.role, "content": content})
        used += cost
    selected.reverse()
    return selected


def _content_with_attachments(msg) -> str:
    """Текст сообщения плюс извлечённый текст его вложений (если есть)."""
    from apps.conversations.attachments import render_attachments_block

    return msg.content + render_attachments_block(msg.attachments.all())
