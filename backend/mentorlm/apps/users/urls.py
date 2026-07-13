from django.urls import path

from .views import (
    MeSettingsDefaultsView,
    MeSettingsView,
    MeView,
    SubscriptionView,
    UsageView,
)

urlpatterns = [
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
