"""Маршруты глобальной памяти: список фактов и удаление одного из них."""

from django.urls import path

from .views import MemoryFactDetailView, MemoryFactListView

urlpatterns = [
    path("memory/facts/", MemoryFactListView.as_view()),
    path("memory/facts/<int:pk>/", MemoryFactDetailView.as_view()),
]
