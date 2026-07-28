from rest_framework import serializers

from .models import Attachment, Conversation, Message


class AttachmentSerializer(serializers.ModelSerializer):
    """Метаданные вложения для UI (сам текст файла наружу не отдаём)."""

    class Meta:
        model = Attachment
        fields = ["id", "filename", "content_type", "size"]
        read_only_fields = fields


class MessageSerializer(serializers.ModelSerializer):
    """Сообщение диалога (read-only — создаётся бэком в процессе чата)."""

    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        # kind/meta нужны фронту, чтобы отрисовать плашки (лимит тарифа, ответ
        # на упрощённой модели) при возврате в чат, а не только в момент ответа.
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
        # title/pinned можно менять через PATCH (переименование, закрепление);
        # mode задаётся при создании во вьюхе, scenario_id — при отправке
        # сообщения (клиент не выставляет его отдельным запросом).
        read_only_fields = ["id", "scenario_id", "created_at", "updated_at"]


class ConversationDetailSerializer(ConversationSerializer):
    """Диалог вместе с историей сообщений (память диалога)."""

    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ["messages"]
