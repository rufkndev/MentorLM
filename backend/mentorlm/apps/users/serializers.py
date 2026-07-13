from rest_framework import serializers

from .models import UserProfile, UserSettings


def settings_defaults() -> dict:
    """Канонические дефолты настроек, выведенные из модели UserSettings.

    Единый источник — сами поля модели: значения по умолчанию берём прямо из
    них для тех полей, что сериализатор отдаёт наружу и разрешает менять. Так
    фронт не держит копию значений (иначе они тихо расходятся с бэком).
    """
    read_only = set(UserSettingsSerializer.Meta.read_only_fields)
    writable = [f for f in UserSettingsSerializer.Meta.fields if f not in read_only]
    model_fields = {f.name: f for f in UserSettings._meta.get_fields()}
    out: dict = {}
    for name in writable:
        field = model_fields.get(name)
        if field is not None:
            out[name] = field.get_default()
    return out


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
