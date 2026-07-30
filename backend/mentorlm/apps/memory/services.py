"""Глобальная память: чтение фактов в промпт и их фоновое извлечение из диалога.

Всё под try/except — сбой памяти никогда не должен ломать основной ответ.
"""

from __future__ import annotations

import json
import logging
import threading

from django.conf import settings
from django.db import connections
from django.utils import timezone

from .models import UserMemoryFact

logger = logging.getLogger(__name__)

# Сколько фактов подмешивать в промпт при разных значениях `memory_use`.
_INJECT_CAP = {"auto": 8, "always": 12}
# Сколько последних сообщений диалога отдаём экстрактору как контекст.
_EXTRACT_CONTEXT_MESSAGES = 6
# За один ответ извлекаем не больше стольких фактов.
_MAX_NEW_FACTS = 3
# Потолок числа фактов на пользователя — старые вытесняются.
_MAX_TOTAL_FACTS = 60

# Как настройка «объём автопамяти» меняет инструкцию экстрактору.
_SCOPE_GUIDANCE = {
    "minimal": (
        "Сохраняй ТОЛЬКО явно выраженные устойчивые предпочтения (как обращаться, "
        "желаемый формат ответов). Будь крайне избирателен, пропускай остальное."
    ),
    "balanced": (
        "Сохраняй важные учебные факты и предпочтения: специальность, уровень "
        "обучения, цели, устойчивые предпочтения по формату ответов."
    ),
    "detailed": (
        "Сохраняй учебный контекст: темы и задачи, над которыми работает "
        "пользователь, используемые инструменты и повторяющиеся трудности — "
        "но без чувствительных персональных данных (пароли, адреса, документы)."
    ),
}


# ── Чтение: факты в системный промпт ──────────────────────────────────────────

def build_memory_block(user_settings) -> str:
    """Блок «что известно о пользователе» для промпта; при memory_use=off — пусто.

    Заодно отмечает факты использованными — для будущего отбора по свежести.
    """
    memory_use = getattr(user_settings, "memory_use", "auto")
    cap = _INJECT_CAP.get(memory_use)
    if not cap:  # off или неизвестное значение
        return ""

    user = user_settings.user
    facts = list(
        UserMemoryFact.objects.filter(user=user)
        .order_by("-created_at")
        .values_list("id", "content")[:cap]
    )
    if not facts:
        return ""

    UserMemoryFact.objects.filter(id__in=[i for i, _ in facts]).update(
        last_used_at=timezone.now()
    )

    lines = "\n".join(f"- {content}" for _, content in facts)
    return (
        "Что ты уже знаешь о пользователе из прошлых диалогов (глобальная память). "
        "Учитывай это, если уместно, но не зачитывай список вслух и не ссылайся на "
        "него явно:\n" + lines
    )


# ── Запись: извлечение фактов после ответа ────────────────────────────────────

def extract_facts_in_background(user, conversation) -> None:
    """Запустить извлечение фактов в отдельном потоке — ответ его не ждёт.

    Память платная: без `allow_memory` в тарифе и без включённой автопамяти не
    пишем ничего.
    """
    from apps.billing.limits import limits_for
    from apps.billing.plans import effective_plan

    if not limits_for(effective_plan(user))["allow_memory"]:
        return
    if not getattr(user.settings, "auto_memory", False):
        return
    thread = threading.Thread(
        target=_extract_and_store,
        args=(user.id, conversation.id, conversation.mode),
        daemon=True,
    )
    thread.start()


def _extract_and_store(user_id: int, conversation_id: int, mode: str) -> None:
    """Тело фонового потока: спросить LLM про новые факты, сохранить, учесть расход."""
    from apps.conversations.models import Message
    from apps.users.models import UserProfile

    try:
        user = UserProfile.objects.select_related("settings").get(id=user_id)
        user_settings = user.settings
        if not getattr(user_settings, "auto_memory", False):
            return

        recent = list(
            Message.objects.filter(conversation_id=conversation_id)
            .order_by("-created_at")[:_EXTRACT_CONTEXT_MESSAGES]
        )
        recent.reverse()
        if not recent:
            return

        existing = list(
            UserMemoryFact.objects.filter(user=user).values_list("content", flat=True)
        )

        raw_facts, tokens_in, tokens_out = _call_extractor(
            recent, existing, user_settings
        )
        _store_new_facts(user, conversation_id, raw_facts, existing)

        # Отдельный платный вызов: списываем в квоту породившего режима, но
        # запросом пользователя не считаем.
        if tokens_in or tokens_out:
            from apps.usage.services import record_usage

            record_usage(
                user,
                mode=mode,
                model=settings.OPENAI_MEMORY_MODEL,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                scenario="memory:extract",
                conversation=None,
                count_as_request=False,
            )
    except Exception:  # noqa: BLE001 — фон не должен падать наружу
        logger.exception("Извлечение фактов памяти не удалось")
    finally:
        # Поток завёл свои соединения с БД — закрываем, чтобы не текли.
        connections.close_all()


def _call_extractor(
    recent_messages, existing_facts, user_settings
) -> tuple[list[str], int, int]:
    """Запросить у дешёвой модели новые факты; вернуть (факты, токены_в, токены_из)."""
    from openai import OpenAI

    scope = getattr(user_settings, "memory_scope", "balanced")
    guidance = _SCOPE_GUIDANCE.get(scope, _SCOPE_GUIDANCE["balanced"])

    dialogue = "\n".join(
        f"{'Пользователь' if m.role == 'user' else 'Ассистент'}: {m.content}"
        for m in recent_messages
    )
    known = "\n".join(f"- {f}" for f in existing_facts) or "(пока ничего)"

    system = (
        "Ты — модуль долговременной памяти учебного ассистента. Твоя задача — "
        "выделить устойчивые факты О ПОЛЬЗОВАТЕЛЕ, полезные в будущих диалогах "
        "(специальность, уровень, цели, предпочтения по формату, инструменты). "
        f"{guidance} "
        "Не сохраняй: разовые вопросы, содержание задач, факты об ассистенте, "
        "то, что уже есть в списке известного, и чувствительные данные. "
        "Формулируй кратко, от третьего лица, по-русски. "
        f"Верни СТРОГО JSON вида {{\"facts\": [\"...\"]}} — не более {_MAX_NEW_FACTS} "
        "фактов; если сохранять нечего, верни пустой список."
    )
    prompt = (
        f"Уже известные факты:\n{known}\n\n"
        f"Последние сообщения диалога:\n{dialogue}\n\n"
        "Какие НОВЫЕ устойчивые факты о пользователе тут появились?"
    )

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = client.chat.completions.create(
        model=settings.OPENAI_MEMORY_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    facts = data.get("facts", []) if isinstance(data, dict) else []

    usage = getattr(resp, "usage", None)
    tokens_in = int(getattr(usage, "prompt_tokens", 0) or 0)
    tokens_out = int(getattr(usage, "completion_tokens", 0) or 0)
    return [f for f in facts if isinstance(f, str)], tokens_in, tokens_out


def _store_new_facts(user, conversation_id, raw_facts, existing_facts) -> None:
    """Сохранить неповторяющиеся факты и вытеснить старые сверх потолка."""
    known_lower = {f.lower() for f in existing_facts}
    to_create = []
    for fact in raw_facts[:_MAX_NEW_FACTS]:
        text = fact.strip()[:300]
        if not text:
            continue
        low = text.lower()
        # Отсекаем точные дубли и очевидные вложенности формулировок.
        if low in known_lower or any(low in e or e in low for e in known_lower):
            continue
        known_lower.add(low)
        to_create.append(
            UserMemoryFact(
                user=user, content=text, source_conversation_id=conversation_id
            )
        )

    if not to_create:
        return
    UserMemoryFact.objects.bulk_create(to_create)

    overflow = (
        UserMemoryFact.objects.filter(user=user)
        .order_by("-created_at")
        .values_list("id", flat=True)[_MAX_TOTAL_FACTS:]
    )
    overflow_ids = list(overflow)
    if overflow_ids:
        UserMemoryFact.objects.filter(id__in=overflow_ids).delete()
