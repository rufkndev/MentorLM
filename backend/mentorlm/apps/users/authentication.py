"""Аутентификация API по access-токену — класс по умолчанию для всего DRF.

Токен проверяется подписью, без похода в базу за сессией; из базы достаётся
только сам профиль, потому что он же становится `request.user` и нужен вьюхам.
Выпускают токены users.tokens, публичные эндпоинты входа — users.auth_views.
"""

from __future__ import annotations

from rest_framework import authentication, exceptions

from .models import UserProfile
from .tokens import InvalidToken, decode_access_token


class SessionJWTAuthentication(authentication.BaseAuthentication):
    """`Authorization: Bearer <access token>` → UserProfile."""

    keyword = "Bearer"

    def authenticate(self, request):
        """Профиль по токену; None — заголовка нет, запрос анонимный."""
        # Читаем META напрямую: DRF-хелпер get_authorization_header кодирует
        # значение в latin-1 и падает с UnicodeEncodeError на заголовке с
        # кириллицей — то есть любой мусор в Authorization давал бы 500
        # с трейсбеком вместо честного 401.
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header:
            return None

        prefix, _, token = header.partition(" ")
        if prefix != self.keyword:
            return None
        if not token.strip():
            raise exceptions.AuthenticationFailed("Пустой токен в заголовке Authorization.")

        try:
            claims = decode_access_token(token.strip())
        except InvalidToken as exc:
            # Текст важен фронту: по 401 он делает ровно один повтор со свежим
            # токеном (src/lib/api.ts), и только потом просит войти заново.
            raise exceptions.AuthenticationFailed(f"Недействительный токен: {exc}") from exc

        try:
            profile = UserProfile.objects.get(pk=claims["sub"])
        except (UserProfile.DoesNotExist, ValueError):
            # Профиль удалён, а токен ещё не истёк — сессии больше нет.
            raise exceptions.AuthenticationFailed("Пользователь не найден.") from None

        if not profile.is_active:
            raise exceptions.AuthenticationFailed("Учётная запись отключена.")

        return (profile, token)

    def authenticate_header(self, request):
        """Без этого DRF отвечает 403 вместо 401, и фронт не поймёт, что пора обновить токен."""
        return self.keyword
