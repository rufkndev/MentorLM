from django.urls import path

from .views import (
    ConversationDetailView,
    ConversationListCreateView,
    GenerationStopView,
    MessageCreateView,
)

urlpatterns = [
    path("conversations/", ConversationListCreateView.as_view()),
    # Остановка генерации — выше маршрута с <int:pk>, чтобы не пересекались.
    path("conversations/stop/", GenerationStopView.as_view()),
    path("conversations/<int:pk>/", ConversationDetailView.as_view()),
    path("conversations/<int:pk>/messages/", MessageCreateView.as_view()),
]
