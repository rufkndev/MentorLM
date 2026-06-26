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
            "interface_lang",
            "font_size",
            "show_suggestions",
            "auto_scroll",
            # параметры модели
            "default_model",
            "temperature",
            "response_length",
            "context_size",
            "streaming",
            "web_search",
            # память / инструкции
            "nickname",
            "occupation",
            "custom_about",
            "custom_style",
            "auto_memory",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]
