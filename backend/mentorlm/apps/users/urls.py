"""Маршруты пользователя: сессия (/api/auth/) и личный кабинет (/api/me/)."""

from django.urls import path

from .auth_views import (
    LoginView,
    LogoutView,
    PasswordChangeView,
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
