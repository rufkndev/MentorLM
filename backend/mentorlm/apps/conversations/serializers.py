"""Сериализаторы диалогов: список для сайдбара и полная переписка с историей."""

from rest_framework import serializers

from apps.ai.sanitize import clean_prompt_text

from .models import Attachment, Conversation, Message

# Колонка вмещает 255, но в сайдбаре видно около сорока символов — длинное
# название всё равно обрезается многоточием, а в базе занимает место.
TITLE_MAX_CHARS = 120


class AttachmentSerializer(serializers.ModelSerializer):
    """Метаданные вложения для UI; извлечённый текст наружу не отдаём."""

    class Meta:
        model = Attachment
        fields = ["id", "filename", "content_type", "size"]
        read_only_fields = fields


class MessageSerializer(serializers.ModelSerializer):
    """Сообщение диалога; создаётся бэком в процессе чата, поэтому read-only."""

    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        # kind и meta нужны фронту, чтобы отрисовать плашки (лимит тарифа, ответ
        # на упрощённой модели) не только в момент ответа, но и при возврате.
        fields = [
            "id",
            "role",
            "kind",
            "content",
            "meta",
            "model",
            "created_at",
            "attachments",
        ]
        read_only_fields = fields


class ConversationSerializer(serializers.ModelSerializer):
    """Краткое представление диалога для списка в сайдбаре."""

    class Meta:
        model = Conversation
        fields = [
            "id",
            "mode",
            "scenario_id",
            "title",
            "pinned",
            "created_at",
            "updated_at",
        ]
        # title и pinned меняются через PATCH; mode задаётся при создании во
        # вьюхе, scenario_id — при отправке сообщения.
        read_only_fields = ["id", "scenario_id", "created_at", "updated_at"]
        extra_kwargs = {"title": {"max_length": TITLE_MAX_CHARS}}

    def validate_title(self, value: str) -> str:
        """Название чата рисуется в сайдбаре, а не идёт в промпт.

        Значит опасны не инструкции, а невидимые символы и переводы строк:
        ими ломают вёрстку списка и прячут настоящее название. Чистим тем же
        инструментом, что и остальной пользовательский текст.
        """
        return clean_prompt_text(value, limit=TITLE_MAX_CHARS, max_lines=1)


class ConversationDetailSerializer(ConversationSerializer):
    """Диалог вместе с историей сообщений — «память» чата для фронта."""

    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ["messages"]
