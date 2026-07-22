"""Контекст диалога и подсчёт токенов — провайдеро-независимая часть.

Строит «память» диалога (историю последних N сообщений) и считает токены —
подсчёт нужен guard'у для потолка ввода. Длина истории меряется ТОЛЬКО числом
сообщений (тариф + глобальный потолок), без токен-бюджета.
"""

from __future__ import annotations

try:  # tiktoken не критичен — при отсутствии считаем токены грубой оценкой
    import tiktoken
except Exception:  # pragma: no cover - окружение без tiktoken
    tiktoken = None


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


def build_context(conversation, *, max_messages: int) -> list[dict]:
    """История диалога для модели — «память» чата.

    Берём последние `max_messages` сообщений (число задаёт тариф, потолок —
    limits.MAX_CONTEXT_MESSAGES). При 0 история пустая — каждый запрос с чистого
    листа. Токен-бюджета нет: длину меряем только числом сообщений. System-промпт
    добавляет провайдер/вьюха отдельно.
    """
    try:
        max_messages = int(max_messages)
    except (TypeError, ValueError):
        max_messages = 0
    if max_messages <= 0:
        return []

    # prefetch вложений — их извлечённый текст подмешиваем в контент сообщения,
    # чтобы модель «видела» прикреплённые файлы (в текущем и прошлых ходах).
    qs = list(
        conversation.messages.prefetch_related("attachments").order_by("created_at")
    )
    recent = qs[-max_messages:]
    return [
        {"role": msg.role, "content": _content_with_attachments(msg)}
        for msg in recent
    ]


def _content_with_attachments(msg) -> str:
    """Текст сообщения плюс извлечённый текст его вложений (если есть)."""
    from apps.conversations.attachments import render_attachments_block

    return msg.content + render_attachments_block(msg.attachments.all())
