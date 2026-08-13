"""Вход, регистрация, обновление сессии и выход.

Единственные публичные эндпоинты кроме health: аутентификация у них отключена
явно, иначе сработал бы глобальный IsAuthenticated и войти было бы нельзя.

Договорённость с фронтом: access-токен возвращается в теле ответа и живёт
только в памяти вкладки, refresh — в httpOnly-cookie, которую JavaScript не
видит. Поэтому украсть сессию через XSS нельзя, а `credentials: "include"`
обязателен на всех запросах сюда.
"""

from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.conf import settings

from .models import UserProfile, UserSettings
from .serializers import UserProfileSerializer
from .tokens import (
    InvalidToken,
    issue_refresh_token,
    make_access_token,
    purge_expired,
    revoke_all,
    revoke_refresh_token,
    rotate_refresh_token,
)

# ── Ограничение попыток ───────────────────────────────────────────────────────
# Форма входа без него — открытый перебор паролей. Считаем в общем кэше (Redis),
# том же, на котором держатся лимиты ИИ (apps/billing/guard.py): на памяти
# процесса каждый воркер считал бы своё, и лимит обходился бы сам собой.
ATTEMPT_WINDOW_SECONDS = 15 * 60
MAX_ATTEMPTS_PER_IP = 10
MAX_ATTEMPTS_PER_EMAIL = 5


def _client_ip(request) -> str:
    """IP клиента с учётом nginx (см. infra/nginx/proxy_params.conf)."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "") or "unknown"


def _too_many_attempts(request, email: str) -> bool:
    """Исчерпан ли лимит попыток; заодно засчитывает текущую.

    Считаем по двум ключам сразу: по IP — против перебора паролей к одному
    аккаунту, по email — против перебора аккаунтов с ботнета.
    """
    limits = (
        (f"auth:ip:{_client_ip(request)}", MAX_ATTEMPTS_PER_IP),
        (f"auth:email:{email}", MAX_ATTEMPTS_PER_EMAIL),
    )
    blocked = False
    for key, allowed in limits:
        # add ставит счётчик только если его не было — так окно начинается с
        # первой попытки и не продлевается следующими.
        cache.add(key, 0, timeout=ATTEMPT_WINDOW_SECONDS)
        try:
            used = cache.incr(key)
        except ValueError:  # ключ истёк между add и incr
            cache.set(key, 1, timeout=ATTEMPT_WINDOW_SECONDS)
            used = 1
        if used > allowed:
            blocked = True
    return blocked


def _reset_attempts(request, email: str) -> None:
    """Сбросить счётчики после успешного входа."""
    cache.delete_many([f"auth:ip:{_client_ip(request)}", f"auth:email:{email}"])


# ── Ответы ────────────────────────────────────────────────────────────────────


def _error(code: str, message: str, http_status: int) -> Response:
    """Ошибка в формате, который разбирает фронт (src/lib/api.ts)."""
    return Response({"code": code, "message": message}, status=http_status)


def _session_response(profile: UserProfile, raw_refresh: str) -> Response:
    """Ответ с access-токеном в теле и refresh-токеном в httpOnly-cookie."""
    response = Response(
        {
            "access": make_access_token(profile),
            "user": UserProfileSerializer(profile).data,
        }
    )
    response.set_cookie(
        settings.AUTH_COOKIE_NAME,
        raw_refresh,
        max_age=int(settings.REFRESH_TOKEN_TTL.total_seconds()),
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        # Cookie нужна только эндпоинтам сессии — на остальные запросы (включая
        # длинные SSE-ответы) её слать незачем.
        path=settings.AUTH_COOKIE_PATH,
    )
    return response


class _PublicView(APIView):
    """База для эндпоинтов входа: без аутентификации и без требования входа."""

    authentication_classes = []
    permission_classes = [AllowAny]


# ── Эндпоинты ─────────────────────────────────────────────────────────────────


class RegisterView(_PublicView):
    """POST /api/auth/register/ — регистрация по email и паролю."""

    def post(self, request):
        email = UserProfile.normalize_email(request.data.get("email", ""))
        password = request.data.get("password") or ""
        consent = request.data.get("consent")

        if not email or not password:
            return _error("invalid_input", "Укажите почту и пароль.", status.HTTP_400_BAD_REQUEST)
        try:
            validate_email(email)
        except DjangoValidationError:
            return _error("invalid_email", "Проверьте адрес почты.", status.HTTP_400_BAD_REQUEST)

        # Согласие на обработку ПДн обязательно (152-ФЗ) и должно быть
        # осознанным действием, поэтому проверяем именно True, а не «истинность».
        if consent is not True:
            return _error(
                "consent_required",
                "Без согласия на обработку персональных данных регистрация невозможна.",
                status.HTTP_400_BAD_REQUEST,
            )

        if _too_many_attempts(request, email):
            return _error(
                "rate_limited",
                "Слишком много попыток. Попробуйте через 15 минут.",
                status.HTTP_429_TOO_MANY_REQUESTS,
            )

        if UserProfile.objects.filter(email=email).exists():
            return _error(
                "email_taken",
                "Эта почта уже зарегистрирована.",
                status.HTTP_400_BAD_REQUEST,
            )

        profile = UserProfile(email=email)
        try:
            # Валидаторы Django (settings.AUTH_PASSWORD_VALIDATORS); profile
            # передаём, чтобы отсечь пароль, совпадающий с почтой.
            validate_password(password, profile)
        except DjangoValidationError as exc:
            return _error("weak_password", " ".join(exc.messages), status.HTTP_400_BAD_REQUEST)

        profile.set_password(password)
        profile.consent_accepted_at = timezone.now()
        profile.consent_policy_version = settings.PRIVACY_POLICY_VERSION
        profile.consent_ip = _client_ip(request)

        try:
            with transaction.atomic():
                profile.save()
                # Настройки создаём здесь: раньше это делал класс аутентификации,
                # и без них не соберётся ни один запрос к ИИ.
                UserSettings.objects.create(user=profile)
        except IntegrityError:
            # Гонка двух одновременных регистраций: unique на email — последний
            # рубеж, проверка ниже нужна для внятного текста.
            return _error(
                "email_taken",
                "Эта почта уже зарегистрирована.",
                status.HTTP_400_BAD_REQUEST,
            )

        _reset_attempts(request, email)
        response = _session_response(profile, issue_refresh_token(profile, request))
        response.status_code = status.HTTP_201_CREATED
        return response


class LoginView(_PublicView):
    """POST /api/auth/login/ — вход по email и паролю."""

    def post(self, request):
        email = UserProfile.normalize_email(request.data.get("email", ""))
        password = request.data.get("password") or ""

        if not email or not password:
            return _error("invalid_input", "Укажите почту и пароль.", status.HTTP_400_BAD_REQUEST)

        if _too_many_attempts(request, email):
            return _error(
                "rate_limited",
                "Слишком много попыток входа. Попробуйте через 15 минут.",
                status.HTTP_429_TOO_MANY_REQUESTS,
            )

        profile = UserProfile.objects.filter(email=email).first()
        # Один и тот же ответ на «нет такой почты» и «неверный пароль»: иначе
        # форма входа превращается в способ узнать, кто зарегистрирован.
        if profile is None or not profile.check_password(password) or not profile.is_active:
            return _error(
                "invalid_credentials",
                "Неверная почта или пароль.",
                status.HTTP_401_UNAUTHORIZED,
            )

        profile.last_login_at = timezone.now()
        profile.save(update_fields=["last_login_at"])
        _reset_attempts(request, email)
        # Дешёвая ленивая уборка: отдельного планировщика в проекте нет.
        purge_expired()

        return _session_response(profile, issue_refresh_token(profile, request))


class RefreshView(_PublicView):
    """POST /api/auth/refresh/ — обменять refresh-cookie на новый access-токен.

    Фронт зовёт этот эндпоинт при загрузке страницы (чтобы понять, есть ли
    сессия) и на каждый 401.
    """

    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_NAME, "")
        try:
            profile, new_raw = rotate_refresh_token(raw, request)
        except InvalidToken as exc:
            response = _error("unauthorized", str(exc), status.HTTP_401_UNAUTHORIZED)
            # Битую cookie сразу убираем, иначе браузер будет слать её вечно.
            response.delete_cookie(settings.AUTH_COOKIE_NAME, path=settings.AUTH_COOKIE_PATH)
            return response

        return _session_response(profile, new_raw)


class LogoutView(_PublicView):
    """POST /api/auth/logout/ — выход с текущего устройства.

    Публичный намеренно: выйти нужно уметь и с протухшим access-токеном.
    Достаточно предъявить cookie — она же и гасится.
    """

    def post(self, request):
        revoke_refresh_token(request.COOKIES.get(settings.AUTH_COOKIE_NAME, ""))
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.AUTH_COOKIE_NAME, path=settings.AUTH_COOKIE_PATH)
        return response


class PasswordChangeView(APIView):
    """POST /api/auth/password/ — смена пароля (нужен вход)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        current = request.data.get("current_password") or ""
        new = request.data.get("new_password") or ""
        profile = request.user

        if not profile.check_password(current):
            return _error(
                "invalid_credentials",
                "Текущий пароль указан неверно.",
                status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_password(new, profile)
        except DjangoValidationError as exc:
            return _error("weak_password", " ".join(exc.messages), status.HTTP_400_BAD_REQUEST)

        profile.set_password(new)
        profile.save(update_fields=["password"])

        # Смена пароля — типичная реакция на «кажется, меня взломали», поэтому
        # выкидываем все остальные устройства. Текущее оставляем: заставлять
        # пользователя логиниться сразу после смены пароля незачем.
        raw = request.COOKIES.get(settings.AUTH_COOKIE_NAME, "")
        revoke_all(profile, except_raw=raw)
        return Response(status=status.HTTP_204_NO_CONTENT)
