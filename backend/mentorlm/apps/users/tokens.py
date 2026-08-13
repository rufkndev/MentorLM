"""Выпуск и проверка токенов сессии — единственное место, где они рождаются.

Схема двухтокенная:

* **access** — короткоживущий JWT (15 минут). Фронт держит его только в памяти
  вкладки и шлёт в заголовке `Authorization`. Он самодостаточен: чтобы его
  проверить, в базу ходить не нужно. Цена этого — отозвать его нельзя, поэтому
  он и живёт четверть часа.
* **refresh** — случайная строка (30 дней) в httpOnly-cookie, недоступной
  JavaScript. Только по ней выдаётся новый access. В базе лежит sha256, а не
  сам токен: дамп базы не должен давать доступ к сессиям.

Refresh одноразовый: `rotate_refresh_token` гасит предъявленный и выдаёт новый.
Это даёт обнаружение кражи — см. комментарий там же.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import timedelta

import jwt
from django.conf import settings
from django.utils import timezone

from .models import RefreshToken, UserProfile

ALGORITHM = "HS256"


class InvalidToken(Exception):
    """Токен просрочен, подделан, отозван или указывает в никуда."""


def _hash(raw: str) -> str:
    """sha256 от токена — то, что действительно лежит в базе.

    Без соли и без медленного KDF намеренно: токен — это 48 случайных байт, а
    не пароль, перебирать там нечего, а проверка идёт на каждый refresh.
    """
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Access-токен ──────────────────────────────────────────────────────────────


def make_access_token(profile: UserProfile) -> str:
    """Выпустить access-JWT для профиля."""
    now = timezone.now()
    payload = {
        "sub": str(profile.pk),
        "email": profile.email,
        "typ": "access",
        "iat": now,
        "exp": now + settings.ACCESS_TOKEN_TTL,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Разобрать и проверить access-JWT; вернуть claims."""
    try:
        claims = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidToken(str(exc)) from exc

    # Refresh-токен — не JWT, но проверка типа страхует от подмены назначения,
    # если однажды появятся другие подписанные нами токены (сброс пароля и т.п.).
    if claims.get("typ") != "access":
        raise InvalidToken("Неверный тип токена.")
    return claims


# ── Refresh-токен ─────────────────────────────────────────────────────────────


def _request_meta(request) -> dict:
    """User-Agent и IP запроса — для списка сессий и разбора инцидентов."""
    if request is None:
        return {"user_agent": "", "ip": None}
    # За nginx настоящий адрес приходит в X-Forwarded-For (infra/nginx/proxy_params.conf);
    # первый элемент — клиент, дальше идут прокси.
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR")
    return {
        "user_agent": request.META.get("HTTP_USER_AGENT", "")[:300],
        "ip": ip or None,
    }


def issue_refresh_token(profile: UserProfile, request=None) -> str:
    """Создать refresh-токен; вернуть СЫРОЕ значение (в базе — только хэш)."""
    raw = secrets.token_urlsafe(48)
    RefreshToken.objects.create(
        user=profile,
        token_hash=_hash(raw),
        expires_at=timezone.now() + settings.REFRESH_TOKEN_TTL,
        **_request_meta(request),
    )
    return raw


def rotate_refresh_token(raw: str, request=None) -> tuple[UserProfile, str]:
    """Обменять refresh-токен на новый; вернуть (профиль, новый сырой токен).

    Токен одноразовый, поэтому предъявление уже погашенного — не ошибка
    пользователя, а признак того, что кто-то использует украденную копию
    (законный владелец свою уже обменял). В этом случае гасим ВСЕ сессии
    пользователя: пусть лучше он войдёт заново, чем чужой останется внутри.
    """
    if not raw:
        raise InvalidToken("Токен не предъявлен.")

    try:
        token = RefreshToken.objects.select_related("user").get(token_hash=_hash(raw))
    except RefreshToken.DoesNotExist:
        raise InvalidToken("Токен не найден.") from None

    now = timezone.now()
    if token.revoked_at is not None:
        revoke_all(token.user)
        raise InvalidToken("Токен уже использован — все сессии сброшены.")
    if token.expires_at <= now:
        raise InvalidToken("Токен просрочен.")
    if not token.user.is_active:
        raise InvalidToken("Учётная запись отключена.")

    token.revoked_at = now
    token.save(update_fields=["revoked_at"])
    return token.user, issue_refresh_token(token.user, request)


def revoke_refresh_token(raw: str) -> None:
    """Погасить один токен (выход с этого устройства). Молча игнорирует чужой."""
    if not raw:
        return
    RefreshToken.objects.filter(token_hash=_hash(raw), revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )


def revoke_all(profile: UserProfile, *, except_raw: str | None = None) -> int:
    """Погасить все живые токены пользователя; вернуть их число.

    `except_raw` оставляет текущую сессию — так смена пароля выкидывает все
    прочие устройства, но не того, кто её выполняет.
    """
    queryset = RefreshToken.objects.filter(user=profile, revoked_at__isnull=True)
    if except_raw:
        queryset = queryset.exclude(token_hash=_hash(except_raw))
    return queryset.update(revoked_at=timezone.now())


def purge_expired(older_than_days: int = 30) -> int:
    """Удалить давно просроченные токены; вернуть число удалённых.

    Строки нужны только для отзыва и разбора инцидентов — вечно копить их
    незачем. Вызывается лениво при входе (см. auth_views).
    """
    cutoff = timezone.now() - timedelta(days=older_than_days)
    deleted, _ = RefreshToken.objects.filter(expires_at__lt=cutoff).delete()
    return deleted
