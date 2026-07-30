"""Аутентификация по Clerk-JWT — единственный способ входа в API.

Токен проверяется по публичным ключам Clerk (JWKS); наша БД никого не
аутентифицирует, а лишь заводит профиль-зеркало при первом обращении.
"""

from __future__ import annotations

import ssl

import certifi
import jwt
from django.conf import settings
from jwt import PyJWKClient
from rest_framework import authentication, exceptions

from .models import UserProfile, UserSettings

# Модульный синглтон: PyJWKClient кэширует набор ключей внутри себя. В Django
# cache не кладём — LocMemCache пиклит значения, а SSLContext не пиклится.
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    """Клиент к JWKS-эндпоинту Clerk, создаётся один раз на процесс.

    SSL-контекст задаём явно с бандлом certifi: urllib внутри PyJWKClient на
    ряде окружений (python.org на macOS, slim-образы) не видит корневых
    сертификатов и падает с CERTIFICATE_VERIFY_FAILED.
    """
    global _jwks_client
    if _jwks_client is None:
        if not settings.CLERK_JWKS_URL:
            raise exceptions.AuthenticationFailed(
                "CLERK_JWKS_URL не настроен на сервере."
            )
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        _jwks_client = PyJWKClient(
            settings.CLERK_JWKS_URL, ssl_context=ssl_context
        )
    return _jwks_client


class ClerkJWTAuthentication(authentication.BaseAuthentication):
    """DRF-аутентификация по session JWT из Clerk.

    Нет заголовка — None (решает permission-класс), невалидный токен — 401,
    валидный — (UserProfile, token).
    """

    keyword = "Bearer"

    def authenticate(self, request):
        """Разобрать заголовок Authorization и вернуть профиль пользователя."""
        header = authentication.get_authorization_header(request).decode("utf-8")
        if not header or not header.startswith(self.keyword + " "):
            return None

        token = header[len(self.keyword) + 1:].strip()
        if not token:
            return None

        claims = self._decode_token(token)
        profile = self._get_or_create_profile(claims)
        return (profile, token)

    def authenticate_header(self, request):
        """Заставляет DRF отдавать 401 вместо 403 при отсутствии токена."""
        return self.keyword

    def _decode_token(self, token: str) -> dict:
        """Проверить подпись и claims токена, вернуть его содержимое."""
        try:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            decode_kwargs = {
                "algorithms": ["RS256"],
                "options": {"require": ["exp", "sub"]},
            }
            # issuer проверяем, только если он задан в настройках.
            if settings.CLERK_ISSUER:
                decode_kwargs["issuer"] = settings.CLERK_ISSUER
            claims = jwt.decode(token, signing_key.key, **decode_kwargs)
        except jwt.PyJWTError as exc:
            raise exceptions.AuthenticationFailed(
                f"Невалидный токен Clerk: {exc}"
            )
        return claims

    @staticmethod
    def _get_or_create_profile(claims: dict) -> UserProfile:
        """Найти или завести профиль по Clerk-id из токена, вместе с настройками."""
        clerk_id = claims.get("sub")
        if not clerk_id:
            raise exceptions.AuthenticationFailed("В токене отсутствует sub.")

        # email есть, если в шаблоне JWT Clerk добавлен соответствующий claim.
        email = claims.get("email") or ""

        profile, _ = UserProfile.objects.get_or_create(
            clerk_id=clerk_id,
            defaults={"email": email},
        )

        # Бэкфилл: email мог появиться в токене уже после регистрации.
        if email and profile.email != email:
            profile.email = email
            profile.save(update_fields=["email"])

        # Настройки — 1:1, гарантируем их наличие сразу.
        UserSettings.objects.get_or_create(user=profile)

        return profile
