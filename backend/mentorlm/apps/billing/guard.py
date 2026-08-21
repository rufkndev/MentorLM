"""Preflight-guard: проверка всех лимитов перед ИИ-запросом плюс лок генерации.

Слои идут от дешёвого к дорогому — тир модели, rate limit, длина ввода, квоты
режима, — и на первом провале бросается `LimitExceeded`, который вьюха отдаёт
клиенту ДО старта SSE. Успешный запрос списывается постфактум (apps.usage).
"""

from __future__ import annotations

import time

from django.core.cache import cache
from django.db.models import Min, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.ai.context import count_tokens
from apps.usage.models import UsageEvent

from .limits import (
    MAX_INPUT_TOKENS,
    MAX_REQUEST_TIMEOUT_SECONDS,
    MODE_LABEL,
    QUOTA_WINDOWS,
    RATE_PER_MIN,
    degrade_requests,
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
    """Лимит исчерпан: машинный код, текст для пользователя, HTTP-статус и детали."""

    def __init__(self, code: str, message: str, status: int, **extra):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.extra = extra


# ── Лок генерации и флаг остановки ────────────────────────────────────────────
# Один пользователь — один активный ответ. Лок берётся во вьюхе ДО preflight,
# поэтому проверка лимитов и списание расхода идут под ним: параллельные запросы
# одного юзера не могут вместе проскочить квоту.

# Аварийный TTL: в норме лок снимается в finally стрима, TTL нужен только если
# воркер умрёт. С запасом над самым долгим ответом, иначе отпустит на живом.
_GEN_LOCK_TTL = MAX_REQUEST_TIMEOUT_SECONDS + 60

# Шаг опроса лока при ожидании — им же меряются паузы ниже.
_LOCK_POLL_SECONDS = 0.1

# Сколько ждать освобождения лока, прежде чем ответить «идёт генерация».
# Предыдущий ответ после «Стопа» сворачивается за секунду-две (сохранить текст,
# списать расход), и без этой паузы следующий вопрос упирался бы в 429 у
# пользователя, который уже видит на экране остановленный ответ.
LOCK_WAIT_SECONDS = 5.0

# Сколько эндпоинт «Стоп» ждёт фактического завершения ответа, прежде чем
# ответить «не успели». Потолок с запасом: стрим замечает флаг между пульсами
# (≈1 с), дальше только сохранение и списание.
STOP_WAIT_SECONDS = 10.0


def acquire_generation_lock(user, *, wait_seconds: float = 0.0) -> bool:
    """Взять лок генерации; True — взяли, можно продолжать.

    cache.add — атомарный SET-if-absent (в Redis `SET NX`). Снимать обязательно
    через release_generation_lock, и кэш должен быть общим для всех воркеров
    (см. settings.CACHES). `wait_seconds` — короткое ожидание вместо мгновенного
    отказа: предыдущий ответ мог быть только что остановлен и ещё сохраняется.
    """
    deadline = time.monotonic() + wait_seconds
    while True:
        if cache.add(f"genlock:{user.pk}", 1, timeout=_GEN_LOCK_TTL):
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(_LOCK_POLL_SECONDS)


def wait_generation_finished(user, seconds: float) -> bool:
    """Дождаться конца текущей генерации; False — не успела за отведённое время.

    Нужно кнопке «Стоп»: пока лок держится, следующий вопрос получит 429, —
    поэтому фронт ждёт подтверждения, а не шлёт его вслепую.
    """
    deadline = time.monotonic() + seconds
    while generation_in_progress(user):
        if time.monotonic() >= deadline:
            return False
        time.sleep(_LOCK_POLL_SECONDS)
    return True


def release_generation_lock(user) -> None:
    """Снять лок генерации — после завершения ответа или ошибки."""
    cache.delete(f"genlock:{user.pk}")


def generation_in_progress(user) -> bool:
    """Пишется ли сейчас ответ этому пользователю.

    Нужно фронту после перезагрузки страницы: живого стрима в браузере уже нет,
    и по этому признаку экран дожидается ответа, а не показывает пустой диалог.
    """
    return bool(cache.get(f"genlock:{user.pk}"))


def request_stop(user) -> None:
    """Попросить остановить текущую генерацию (кнопка «Стоп»).

    Отдельный короткий запрос, а не обрыв соединения: стрим увидит флаг между
    дельтами, сохранит написанное и сразу снимет лок — следующий вопрос можно
    отправлять, не дожидаясь, пока сервер заметит разрыв.
    """
    cache.set(f"genstop:{user.pk}", 1, timeout=_GEN_LOCK_TTL)


def stop_requested(user) -> bool:
    """Просил ли пользователь остановить текущую генерацию."""
    return bool(cache.get(f"genstop:{user.pk}"))


def clear_stop(user) -> None:
    """Снять флаг остановки — перед новой генерацией и после её завершения."""
    cache.delete(f"genstop:{user.pk}")


# ── Расход по скользящим окнам ────────────────────────────────────────────────


def _window_usage(user, mode: str, now) -> dict[str, int]:
    """Расход режима по каждому окну (µ$) — одним запросом.

    Фильтруем по самому длинному окну (идёт по индексу user+mode+created_at),
    короткие окна выделяем условной агрегацией.
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
    """Когда окно начнёт восстанавливаться: самое старое событие в нём + длина окна."""
    delta, _ = QUOTA_WINDOWS[window]
    oldest = UsageEvent.objects.filter(
        user=user, mode=mode, created_at__gte=now - delta
    ).aggregate(m=Min("created_at"))["m"]
    return (oldest + delta) if oldest else (now + delta)


# ── Витрина расхода ───────────────────────────────────────────────────────────
# Проценты живут здесь же, где считаются квоты: ЛК, сайдбар и событие конца
# стрима обязаны показывать одно и то же число.


def _window_view(used: int, limit: int | None, resets_at, human: str) -> dict:
    """Одно скользящее окно для интерфейса: доля расхода и момент восстановления.

    Абсолютные µ$ наружу не отдаём. Время возвращаем при любом расходе, даже
    если доля округлилась до 0% — иначе на малом расходе оно бы пропадало.
    """
    if limit is None:  # безлимит
        return {
            "used_pct": 0,
            "remaining_pct": 100,
            "resets_at": None,
            "window_label": human,
        }
    used_pct = min(100, round(used / limit * 100)) if limit else 100
    return {
        "used_pct": used_pct,
        "remaining_pct": 100 - used_pct,
        "resets_at": resets_at.isoformat() if used > 0 else None,
        "window_label": human,
    }


def mode_usage_report(user, mode: str, *, plan: str | None = None, now=None) -> dict:
    """Расход режима по всем окнам — для ЛК и для события конца стрима.

    Окна отдаём ВСЕ и по отдельности: интерфейс показывает и 5-часовое, и
    недельное. Одной шкалой на режим их не свести — она показывала бы то одно
    окно, то другое, и остаток «прыгал» бы без объяснений: маленький вопрос
    почти не двигает недельную долю, но заметно двигает пятичасовую.
    Верхние поля — самое забитое окно (`tightest_window`): оно упрётся первым.
    """
    plan = plan or effective_plan(user)
    now = now or timezone.now()
    quota = quota_for(plan, mode)
    used = _window_usage(user, mode, now)

    windows = {}
    tightest, top_pct = None, -1
    for window, (_, human) in QUOTA_WINDOWS.items():
        limit = quota.limit(window)
        resets_at = _window_reset(user, mode, window, now) if used[window] else now
        view = _window_view(used[window], limit, resets_at, human)
        windows[window] = view
        if view["used_pct"] > top_pct:
            tightest, top_pct = window, view["used_pct"]

    return {
        "label": MODE_LABEL.get(mode, mode).strip("«»"),
        **windows[tightest],
        "tightest_window": tightest,
        "windows": windows,
    }


def preflight(user, *, mode: str, scenario: str | None, input_text: str) -> str:
    """Проверить лимиты перед запросом и вернуть решение.

    "allow" — обычный путь; "degrade" — квота исчерпана, но остались grace-
    запросы, отвечаем на дешёвой модели. Жёсткий провал (недоступный тир,
    rate limit, длинный ввод, исчерпанные квота и grace) — LimitExceeded.
    """
    plan = effective_plan(user)
    limits = limits_for(plan)
    now = timezone.now()

    # Доступность тира модели тарифу — апселл на «Максимальную».
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

    # Анти-спам: фиксированное окно в минуту, единое для всех тарифов. Как и лок
    # генерации, требует общего кэша воркеров (settings.CACHES).
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

    # Экстремально длинный ввод: reject до вызова модели, запрос не тратится.
    if count_tokens(input_text, "gpt-4o") > MAX_INPUT_TOKENS:
        raise LimitExceeded(
            "input_too_long",
            "Сообщение слишком длинное. Сократите его или разбейте на части.",
            status=413,
            limit=MAX_INPUT_TOKENS,
        )

    # Квоты режима — главный предохранитель. Исчерпанное окно не блокирует
    # сразу: сначала несколько ответов на дешёвой модели (число зависит от
    # режима — limits.degrade_requests), и только когда кончились и они —
    # жёсткий блок до восстановления окна.
    quota = quota_for(plan, mode)
    used = _window_usage(user, mode, now)
    decision = "allow"
    for window, (delta, human) in QUOTA_WINDOWS.items():
        limit = quota.limit(window)
        if limit is None or used[window] < limit:  # безлимит или квота есть
            continue
        grace_used = UsageEvent.objects.filter(
            user=user, mode=mode, degraded=True, created_at__gte=now - delta
        ).count()
        if grace_used >= degrade_requests(mode):
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
