from rest_framework import serializers

from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    """Сообщение диалога (read-only — создаётся бэком в процессе чата)."""

    class Meta:
        model = Message
        fields = ["id", "role", "content", "model", "created_at"]
        read_only_fields = fields


class ConversationSerializer(serializers.ModelSerializer):
    """Краткое представление диалога для списка в сайдбаре."""

    class Meta:
        model = Conversation
        fields = ["id", "mode", "title", "pinned", "created_at", "updated_at"]
        # title/pinned можно менять через PATCH (переименование, закрепление);
        # mode задаётся при создании во вьюхе.
        read_only_fields = ["id", "created_at", "updated_at"]


class ConversationDetailSerializer(ConversationSerializer):
    """Диалог вместе с историей сообщений (память диалога)."""

    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ["messages"]
