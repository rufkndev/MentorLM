"""Сериализаторы диалогов: список для сайдбара и полная переписка с историей."""

from rest_framework import serializers

from .models import Attachment, Conversation, Message


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


class ConversationDetailSerializer(ConversationSerializer):
    """Диалог вместе с историей сообщений — «память» чата для фронта."""

    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ["messages"]
