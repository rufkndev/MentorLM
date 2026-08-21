"""Маршруты пользователя: сессия (/api/auth/) и личный кабинет (/api/me/)."""

from django.urls import path

from .auth_views import (
    EmailVerifyConfirmView,
    EmailVerifyRequestView,
    LoginView,
    LogoutView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RefreshView,
    RegisterView,
)
from .views import (
    MeSettingsDefaultsView,
    MeSettingsView,
    MeView,
    SubscriptionView,
    UsageView,
)

urlpatterns = [
    # Сессия. Всё, кроме смены пароля, доступно без входа.
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/password/", PasswordChangeView.as_view(), name="auth-password"),

    # Письма. Подтверждение почты и сброс пароля приходят ссылкой на страницу
    # фронта, а она уже зовёт эти эндпоинты с токеном из адреса.
    path(
        "auth/verify-email/request/",
        EmailVerifyRequestView.as_view(),
        name="auth-verify-email-request",
    ),
    path("auth/verify-email/", EmailVerifyConfirmView.as_view(), name="auth-verify-email"),
    path(
        "auth/password-reset/",
        PasswordResetRequestView.as_view(),
        name="auth-password-reset",
    ),
    path(
        "auth/password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),

    # Личный кабинет.
    path("me/", MeView.as_view(), name="me"),
    path("me/settings/", MeSettingsView.as_view(), name="me-settings"),
    path(
        "me/settings/defaults/",
        MeSettingsDefaultsView.as_view(),
        name="me-settings-defaults",
    ),
    path("me/usage/", UsageView.as_view(), name="me-usage"),
    path("me/subscription/", SubscriptionView.as_view(), name="me-subscription"),
]
