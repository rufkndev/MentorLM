"""Preflight-guard: единая проверка лимитов перед ИИ-запросом.

Идея — не дать пользователю или боту сжечь квоту тарифа. Перед каждым запросом
проверяем по порядку (дёшево → дорого) и на первом провале бросаем
`LimitExceeded`, который вьюха превращает в JSON-ответ с нужным HTTP-статусом
ДО старта SSE-стрима. Успешный запрос списывается постфактум (apps.usage).

Порядок слоёв защиты:
    0. лок генерации (см. acquire_generation_lock) — один пользователь = один
       активный ответ. Берётся во вьюхе ДО preflight, поэтому проверка лимитов и
       последующее списание идут под локом → параллельные запросы одного юзера
       не могут вместе проскочить лимит (нет overshoot).
    1. активный тариф → его лимиты
    2. доступность фичи тарифу (тир модели) — апселл на quality
    3. rate limit (частые запросы подряд) — анти-спам
    4. слишком длинный ввод
    5. квоты режима по скользящим окнам — ГЛАВНЫЙ предохранитель

Расход измеряется в расчётных токенах (billable_tokens), квоты — раздельные по
режимам, окна — скользящие (см. billing.limits). Проверяем по факту уже
списанного: перелёт одним запросом ограничен max_output_tokens (потолок на
тариф) и финансово несуществен.
"""

from __future__ import annotations

from django.core.cache import cache
from django.db.models import Min, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.ai.context import count_tokens
from apps.usage.models import UsageEvent

from .limits import (
    DEGRADE_REQUESTS,
    MAX_INPUT_TOKENS,
    MODE_LABEL,
    QUOTA_WINDOWS,
    RATE_PER_MIN,
    limits_for,
    quota_for,
)
from .plans import effective_plan

# Поле настроек с продуктовым тиром модели для каждого режима.
_MODE_TIER_FIELD = {
    "chat": "chat_model",
    "code": "code_model",
    "research": "research_model",
}


class LimitExceeded(Exception):
    """Лимит тарифа исчерпан. Несёт машинный code, текст и HTTP-статус."""

    def __init__(self, code: str, message: str, status: int, **extra):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.extra = extra


# Аварийный потолок времени жизни лока генерации. При нормальной работе лок
# снимается сразу после ответа (release_generation_lock в finally стрима); TTL
# нужен только на случай, если воркер умрёт и finally не выполнится — иначе юзер
# завис бы навсегда. Держать чуть больше самого долгого ответа (research + web).
_GEN_LOCK_TTL = 180


def acquire_generation_lock(user) -> bool:
    """Взять лок «у пользователя уже идёт генерация». True — взяли, можно продолжать.

    Реализован через cache.add — атомарный SET-if-absent (в Redis это `SET NX`).
    Снимать ОБЯЗАТЕЛЬНО через release_generation_lock в finally стрима. В prod кэш
    должен быть общий (Redis), как и для rate limit; на LocMem лок действует лишь
    в пределах одного воркера.
    """
    return bool(cache.add(f"genlock:{user.pk}", 1, timeout=_GEN_LOCK_TTL))


def release_generation_lock(user) -> None:
    """Снять лок генерации (после завершения ответа или ошибки)."""
    cache.delete(f"genlock:{user.pk}")


def _window_usage(user, mode: str, now) -> dict[str, int]:
    """SUM(billable_tokens) по каждому скользящему окну — одним запросом.

    Фильтруем по самому длинному окну (проход по индексу user+mode+created_at),
    короткие окна режем условной агрегацией.
    """
    longest = max(delta for delta, _ in QUOTA_WINDOWS.values())
    aggs = {
        key: Coalesce(
            Sum("billable_tokens", filter=Q(created_at__gte=now - delta)), 0
        )
        for key, (delta, _) in QUOTA_WINDOWS.items()
    }
    return UsageEvent.objects.filter(
        user=user, mode=mode, created_at__gte=now - longest
    ).aggregate(**aggs)


def _window_reset(user, mode: str, window: str, now):
    """Когда окно начнёт восстанавливаться — момент выпадения самого старого
    события из окна (min(created_at) + длительность окна)."""
    delta, _ = QUOTA_WINDOWS[window]
    oldest = UsageEvent.objects.filter(
        user=user, mode=mode, created_at__gte=now - delta
    ).aggregate(m=Min("created_at"))["m"]
    return (oldest + delta) if oldest else (now + delta)


def preflight(user, *, mode: str, scenario: str | None, input_text: str) -> str:
    """Проверяет все лимиты. Возвращает решение по запросу:

    - "allow"   — обычный путь, квота есть;
    - "degrade" — квота исчерпана, но остались grace-запросы: гоним ответ на
      дешёвой модели (см. ai.service), не блокируя.

    Бросает LimitExceeded при жёстком провале (rate limit, длинный ввод,
    недоступный тир, а также когда исчерпаны и квота, и grace-запросы).
    """
    plan = effective_plan(user)
    limits = limits_for(plan)
    now = timezone.now()

    # 2. Доступность тира модели тарифу (апселл на quality).
    tier_field = _MODE_TIER_FIELD.get(mode)
    chosen_tier = (
        getattr(user.settings, tier_field, "default") if tier_field else "default"
    )
    if chosen_tier not in limits["allowed_tiers"]:
        raise LimitExceeded(
            "feature_locked",
            "Максимальная модель доступна на платных тарифах. "
            "Выберите стандартную модель в настройках или перейдите на тариф выше.",
            status=402,
            tier=chosen_tier,
        )

    # 3. Rate limit — единый для всех тарифов, фиксированное окно в минуту.
    # В prod кэш должен быть общий (Redis); LocMem ок для одного воркера в dev.
    rate = RATE_PER_MIN
    minute = now.strftime("%Y%m%d%H%M")
    key = f"rl:{user.pk}:{minute}"
    cache.add(key, 0, timeout=60)
    try:
        count = cache.incr(key)
    except ValueError:  # ключ истёк между add и incr — начинаем окно заново
        cache.set(key, 1, timeout=60)
        count = 1
    if count > rate:
        raise LimitExceeded(
            "rate_limited",
            "Слишком часто. Подождите немного и попробуйте снова.",
            status=429,
        )

    # 4. Слишком длинный ввод — единый глобальный потолок (анти-абуз, экстрим).
    # Reject до вызова модели, поэтому запрос не тратится.
    if count_tokens(input_text, "gpt-4o") > MAX_INPUT_TOKENS:
        raise LimitExceeded(
            "input_too_long",
            "Сообщение слишком длинное. Сократите его или разбейте на части.",
            status=413,
            limit=MAX_INPUT_TOKENS,
        )

    # 5. Квоты режима по скользящим окнам — главный предохранитель.
    # Исчерпанное окно не блокирует сразу: сначала DEGRADE_REQUESTS ответов на
    # дешёвой модели (grace), и только когда и они кончились — жёсткий блок.
    quota = quota_for(plan, mode)
    used = _window_usage(user, mode, now)
    decision = "allow"
    for window, (delta, human) in QUOTA_WINDOWS.items():
        limit = quota.limit(window)
        if limit is None or used[window] < limit:  # безлимит или квота есть
            continue
        # Окно исчерпано. Сколько grace-запросов уже выдано в этом окне.
        grace_used = UsageEvent.objects.filter(
            user=user, mode=mode, degraded=True, created_at__gte=now - delta
        ).count()
        if grace_used >= DEGRADE_REQUESTS:
            resets_at = _window_reset(user, mode, window, now)
            raise LimitExceeded(
                "mode_quota_exceeded",
                f"Лимит режима {MODE_LABEL.get(mode, '')} исчерпан "
                f"(окно {human}). Он начнёт восстанавливаться "
                f"{timezone.localtime(resets_at).strftime('%d.%m в %H:%M')} — "
                "или перейдите на тариф выше, чтобы продолжить сейчас.",
                status=429,
                mode=mode,
                window=window,
                used=used[window],
                limit=limit,
                resets_at=resets_at.isoformat(),
            )
        decision = "degrade"
    return decision
