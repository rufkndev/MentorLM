"""Маршруты диалогов: список, деталь, отправка сообщения и остановка ответа."""

from django.urls import path

from .export_views import MessageExportView
from .views import (
    ConversationDetailView,
    ConversationListCreateView,
    GenerationStopView,
    MessageCreateView,
)

urlpatterns = [
    path("conversations/", ConversationListCreateView.as_view()),
    # Выше маршрута с <int:pk>, иначе «stop» разбирался бы как id.
    path("conversations/stop/", GenerationStopView.as_view()),
    path("conversations/<int:pk>/", ConversationDetailView.as_view()),
    path("conversations/<int:pk>/messages/", MessageCreateView.as_view()),
    path(
        "conversations/<int:pk>/messages/<int:mid>/export/<str:fmt>/",
        MessageExportView.as_view(),
    ),
]
