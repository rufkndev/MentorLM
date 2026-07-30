"""Сериализатор факта памяти для вкладки настроек."""

from rest_framework import serializers

from .models import UserMemoryFact


class UserMemoryFactSerializer(serializers.ModelSerializer):
    """Факт памяти для отображения; создаётся только бэком, поэтому read-only."""

    class Meta:
        model = UserMemoryFact
        fields = ["id", "content", "created_at"]
        read_only_fields = fields
