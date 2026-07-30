"""Сериализаторы ЛК: профиль (только чтение) и настройки (частичное обновление)."""

from rest_framework import serializers

from .models import UserProfile, UserSettings


def settings_defaults() -> dict:
    """Дефолты настроек, выведенные прямо из полей модели.

    Единый источник — сама модель: так фронт не держит копию значений, которая
    тихо разъезжается с бэком. Берём только то, что сериализатор отдаёт наружу
    и разрешает менять.
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
    """Профиль для ЛК; имя и аватар фронт берёт из Clerk, а не отсюда."""

    # Тариф считается из подписок на лету, поэтому протухнуть ему негде.
    plan = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ["clerk_id", "email", "plan", "created_at"]
        read_only_fields = fields

    def get_plan(self, obj) -> str:
        """Действующий тариф пользователя."""
        from apps.billing.plans import effective_plan

        return effective_plan(obj)


class UserSettingsSerializer(serializers.ModelSerializer):
    """Настройки пользователя; набор полей совпадает с фронтовым типом Settings."""

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
