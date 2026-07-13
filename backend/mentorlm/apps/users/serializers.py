from rest_framework import serializers

from .models import UserProfile, UserSettings


class UserProfileSerializer(serializers.ModelSerializer):
    """Read-only представление профиля для ЛК (имя/аватар берёт фронт из Clerk)."""

    class Meta:
        model = UserProfile
        fields = ["clerk_id", "email", "plan", "created_at"]
        read_only_fields = fields


class UserSettingsSerializer(serializers.ModelSerializer):
    """Продуктовые настройки пользователя. Поддерживает частичное обновление (PATCH)."""

    class Meta:
        model = UserSettings
        fields = [
            # внешний вид / поведение
            "theme",
            "font_size",
            # данные
            "chat_retention_days",
            # параметры модели ИИ
            "chat_model",
            "code_model",
            "research_model",
            "creativity",
            "response_length_preference",
            "reasoning_depth",
            # память / инструкции
            "nickname",
            "occupation",
            "education_level",
            "field_of_study",
            "learning_goals",
            "custom_about",
            "custom_style",
            "context_depth",
            "auto_memory",
            "memory_scope",
            "memory_use",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]
