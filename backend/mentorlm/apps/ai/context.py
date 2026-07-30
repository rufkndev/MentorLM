"""Сборка истории диалога для модели и подсчёт токенов.

Провайдеро-независимая часть ИИ-слоя: «память» чата в едином формате
`[{role, content}]` и оценка длины текста для предохранителей billing.
"""

from __future__ import annotations

try:  # tiktoken необязателен: без него считаем токены грубой оценкой
    import tiktoken
except Exception:  # pragma: no cover - окружение без tiktoken
    tiktoken = None


def _encoding(model: str):
    """Кодировка tiktoken для модели; для незнакомых — общая, иначе None."""
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
    """Число токенов в тексте; для не-OpenAI моделей — приближение."""
    enc = _encoding(model)
    if enc is None:
        return max(1, len(text) // 4)  # ~4 символа на токен
    return len(enc.encode(text))


def build_context(conversation, *, max_messages: int) -> list[dict]:
    """История диалога для модели — «память» чата.

    `max_messages` ограничивает только ПРЕДЫСТОРИЮ (тариф → сценарий → настройка
    юзера, см. ai.service). Текущий вопрос уходит модели всегда, иначе отвечать
    было бы не на что: при 0 остаётся только он. System-промпт добавляется
    отдельно провайдером.
    """
    try:
        max_messages = int(max_messages)
    except (TypeError, ValueError):
        max_messages = 0

    # Вложения подтягиваем вместе с сообщениями: их извлечённый текст идёт в
    # контент, чтобы модель «видела» файлы и в прошлых ходах. Уведомления
    # (kind=notice, напр. «лимит исчерпан») адресованы пользователю, не модели.
    qs = list(
        conversation.messages.filter(kind="text")
        .prefetch_related("attachments")
        .order_by("created_at")
    )
    if not qs:
        return []
    previous = qs[-max_messages - 1:-1] if max_messages > 0 else []
    return _normalize(
        [
            {"role": msg.role, "content": _content_with_attachments(msg)}
            for msg in (*previous, qs[-1])
        ]
    )


def _normalize(history: list[dict]) -> list[dict]:
    """Привести историю к виду, который принимают все провайдеры.

    Anthropic требует начинать с сообщения пользователя и строго чередовать
    роли, а срез предыстории этого не гарантирует: он может начаться с ответа
    ассистента, а пропуск уведомлений и неудавшихся ответов оставляет две
    реплики одной роли подряд. Чиним здесь — инвариант общий для всех.
    """
    start = next((i for i, m in enumerate(history) if m["role"] == "user"), len(history))
    merged: list[dict] = []
    for msg in history[start:]:
        if merged and merged[-1]["role"] == msg["role"]:
            merged[-1]["content"] += "\n\n" + msg["content"]
        else:
            merged.append(msg)
    return merged


def _content_with_attachments(msg) -> str:
    """Текст сообщения плюс извлечённый текст его вложений (если есть)."""
    from apps.conversations.attachments import render_attachments_block

    return msg.content + render_attachments_block(msg.attachments.all())
