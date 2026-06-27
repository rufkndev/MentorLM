"""Слой работы с LLM для режимов MentorLM.

Пока реализован только режим «Общий» (chat) поверх OpenAI. Логика изолирована
здесь, чтобы позже вынести её в единый AI-сервис (apps/ai) и добавить других
провайдеров (Anthropic, Yandex) без правок во вьюхах.
"""

from __future__ import annotations

from typing import Iterator

from django.conf import settings

try:  # tiktoken не критичен — при отсутствии считаем токены грубой оценкой
    import tiktoken
except Exception:  # pragma: no cover - окружение без tiktoken
    tiktoken = None


# Базовый системный промпт режима «Общий».
BASE_SYSTEM_PROMPTS = {
    "chat": (
        "Ты — MentorLM, доброжелательный ИИ-ассистент для учёбы российских "
        "студентов. Отвечай по-русски, ясно и по существу, помогай разбираться "
        "в материале, а не просто давай готовый ответ. "
        "Пиши ответ обычным текстом без Markdown-разметки: не используй символы "
        "*, **, _, #, обратные кавычки, маркированные списки через - или * и "
        "таблицы. Для перечислений используй обычные предложения или нумерацию "
        "вида «1.», «2.». Ответ должен копироваться как чистый текст."
    ),
}

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
    """Число токенов в тексте; при отсутствии tiktoken — грубая оценка."""
    enc = _encoding(model)
    if enc is None:
        # ~4 символа на токен — достаточно для обрезки контекста.
        return max(1, len(text) // 4)
    return len(enc.encode(text))


def resolve_model(user_settings) -> str:
    """Реальный OpenAI-id модели.

    settings.default_model сейчас хранит продуктовые плейсхолдеры (mentor-pro),
    поэтому используем его, только если это похоже на OpenAI-модель.
    """
    chosen = (getattr(user_settings, "default_model", "") or "").strip()
    if chosen.startswith("gpt-"):
        return chosen
    return settings.OPENAI_CHAT_MODEL


def build_system_prompt(user_settings, mode: str, scenario_prompt: str = "") -> str:
    """Системный промпт = база режима + сценарий + персонализация пользователя."""
    parts = [BASE_SYSTEM_PROMPTS.get(mode, BASE_SYSTEM_PROMPTS["chat"])]

    if scenario_prompt:
        parts.append(scenario_prompt.strip())

    persona: list[str] = []
    if getattr(user_settings, "nickname", ""):
        persona.append(f"Обращайся к пользователю по имени: {user_settings.nickname}.")
    if getattr(user_settings, "occupation", ""):
        persona.append(f"Род занятий пользователя: {user_settings.occupation}.")
    if getattr(user_settings, "custom_about", ""):
        persona.append(f"О пользователе: {user_settings.custom_about}")
    if getattr(user_settings, "custom_style", ""):
        persona.append(f"Предпочтительный стиль ответов: {user_settings.custom_style}")
    if persona:
        parts.append("\n".join(persona))

    return "\n\n".join(p for p in parts if p)


def build_context(conversation, user_settings, plan_limits) -> list[dict]:
    """История диалога для модели — «память» чата.

    Берём сообщения по порядку, оставляем последние N (context_size) и
    обрезаем по бюджету токенов тарифа. System-промпт добавляет вьюха отдельно.
    """
    try:
        max_messages = int(user_settings.context_size)
    except (TypeError, ValueError):
        max_messages = 20

    token_budget = plan_limits.get("context_tokens") or 8_000
    model = resolve_model(user_settings)

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


def stream_chat_completion(
    messages: list[dict],
    *,
    model: str,
    temperature: float,
    response_length: str,
    usage: dict,
) -> Iterator[str]:
    """Стримит ответ OpenAI по токенам.

    Заполняет `usage` ключами prompt_tokens / completion_tokens после стрима
    (из финального чанка include_usage, с фолбэком на оценку tiktoken).
    """
    from openai import BadRequestError, OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    max_tokens = RESPONSE_MAX_TOKENS.get(response_length, RESPONSE_MAX_TOKENS["balanced"])

    completion = ""
    base_kwargs = dict(
        model=model,
        messages=messages,
        # max_tokens устарел в пользу max_completion_tokens (док OpenAI 2026).
        max_completion_tokens=max_tokens,
        stream=True,
        stream_options={"include_usage": True},
    )
    try:
        stream = client.chat.completions.create(
            temperature=temperature, **base_kwargs
        )
    except BadRequestError as exc:
        # Reasoning-модели (o-series / gpt-5) принимают только temperature=1 —
        # повторяем без параметра, чтобы модель взяла своё значение по умолчанию.
        if "temperature" in str(exc):
            stream = client.chat.completions.create(**base_kwargs)
        else:
            raise

    for chunk in stream:
        if chunk.usage is not None:
            usage["prompt_tokens"] = chunk.usage.prompt_tokens
            usage["completion_tokens"] = chunk.usage.completion_tokens
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            completion += delta
            yield delta

    # Фолбэк, если провайдер не вернул точный расход токенов.
    if "prompt_tokens" not in usage:
        prompt_text = "\n".join(m["content"] for m in messages)
        usage["prompt_tokens"] = count_tokens(prompt_text, model)
    if "completion_tokens" not in usage:
        usage["completion_tokens"] = count_tokens(completion, model)
