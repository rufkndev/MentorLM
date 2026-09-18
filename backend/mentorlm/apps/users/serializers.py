"""Сериализаторы ЛК: профиль (только чтение) и настройки (частичное обновление)."""

from rest_framework import serializers

from apps.ai.preferences import PERSONA_LIMITS
from apps.ai.sanitize import clean_prompt_text

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
    """Профиль для ЛК. Пароль и данные о согласии наружу не отдаём."""

    # Тариф считается из подписок на лету, поэтому протухнуть ему негде.
    plan = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ["id", "email", "plan", "email_verified", "created_at"]
        read_only_fields = fields

    def get_plan(self, obj) -> str:
        """Действующий тариф пользователя."""
        from apps.billing.plans import effective_plan

        return effective_plan(obj)


class UserSettingsSerializer(serializers.ModelSerializer):
    """Настройки пользователя; набор полей совпадает с фронтовым типом Settings.

    Свободные поля «о себе» уходят в системный промпт (ai.preferences._persona),
    поэтому здесь они и ограничиваются по длине, и обезвреживаются:

    * `max_length` приходится задавать руками — DRF выводит его из модели только
      для `CharField`; у `TextField` ограничение модели до сериализатора не
      доезжает, и поле осталось бы безразмерным;
    * `clean_prompt_text` снимает разметку ролей и невидимые символы ДО записи.
      Чинить это на чтении было бы поздно: в базе уже лежал бы текст, который
      любой новый код мог бы взять напрямую.
    """

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
        extra_kwargs = {
            name: {"max_length": limit} for name, limit in PERSONA_LIMITS.items()
        }

    def validate_nickname(self, value: str) -> str:
        return self._clean("nickname", value, max_lines=1)

    def validate_occupation(self, value: str) -> str:
        return self._clean("occupation", value, max_lines=1)

    def validate_field_of_study(self, value: str) -> str:
        return self._clean("field_of_study", value, max_lines=1)

    def validate_learning_goals(self, value: str) -> str:
        return self._clean("learning_goals", value)

    def validate_custom_about(self, value: str) -> str:
        return self._clean("custom_about", value)

    def validate_custom_style(self, value: str) -> str:
        return self._clean("custom_style", value)

    @staticmethod
    def _clean(name: str, value: str, max_lines: int = 20) -> str:
        return clean_prompt_text(value, limit=PERSONA_LIMITS[name], max_lines=max_lines)
