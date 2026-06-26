from __future__ import annotations

import ssl

import certifi
import jwt
from django.conf import settings
from jwt import PyJWKClient
from rest_framework import authentication, exceptions

from .models import UserProfile, UserSettings

# Модульный синглтон PyJWKClient (сам кэширует JWK-набор внутри). Не кладём его
# в Django cache: LocMemCache пиклит значения, а SSLContext не пиклится.
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    """Вернуть PyJWKClient для JWKS-эндпоинта Clerk.

    PyJWKClient тянет JWKS через urllib, который на ряде окружений (python.org
    Python на macOS, slim-образы) не имеет доступа к корневым сертификатам и
    падает с CERTIFICATE_VERIFY_FAILED. Поэтому явно передаём ssl-контекст с
    бандлом certifi — работает одинаково локально и в Docker.
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
    """DRF-аутентификация по Clerk session JWT.

    - Нет заголовка `Authorization: Bearer` → возвращаем None (анонимный запрос,
      доступ решит permission-класс).
    - Токен есть, но невалиден → AuthenticationFailed (401).
    - Токен валиден → (UserProfile, token). UserProfile создаётся при первом
      обращении (get_or_create), вместе с пустыми UserSettings.
    """

    keyword = "Bearer"

    def authenticate(self, request):
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
        # Заставляет DRF отдавать 401 (а не 403) при отсутствии аутентификации.
        return self.keyword

    def _decode_token(self, token: str) -> dict:
        try:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            decode_kwargs = {
                "algorithms": ["RS256"],
                "options": {"require": ["exp", "sub"]},
            }
            # Если задан issuer — дополнительно проверяем claim `iss`.
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
        clerk_id = claims.get("sub")
        if not clerk_id:
            raise exceptions.AuthenticationFailed("В токене отсутствует sub.")

        # email может присутствовать, если в Clerk JWT template добавлен claim.
        email = claims.get("email") or ""

        profile, _ = UserProfile.objects.get_or_create(
            clerk_id=clerk_id,
            defaults={"email": email},
        )

        # Бэкфилл email, если он появился в токене позже регистрации.
        if email and profile.email != email:
            profile.email = email
            profile.save(update_fields=["email"])

        # Гарантируем наличие связанных настроек (1:1).
        UserSettings.objects.get_or_create(user=profile)

        return profile
