from django.urls import path

from .views import (
    ConversationDetailView,
    ConversationListCreateView,
    MessageCreateView,
)

urlpatterns = [
    path("conversations/", ConversationListCreateView.as_view()),
    path("conversations/<int:pk>/", ConversationDetailView.as_view()),
    path("conversations/<int:pk>/messages/", MessageCreateView.as_view()),
]
