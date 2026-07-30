"""Админка переписки: просмотр диалогов и сообщений для поддержки и отладки."""

from django.contrib import admin

from .models import Conversation, Message


class MessageInline(admin.TabularInline):
    """Сообщения прямо на странице диалога."""

    model = Message
    extra = 0


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    """Диалоги с фильтром по режиму и поиском по владельцу."""

    list_display = ("id", "user", "mode", "title", "updated_at")
    list_filter = ("mode",)
    search_fields = ("title", "user__email", "user__clerk_id")
    inlines = (MessageInline,)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    """Плоский список сообщений — удобно смотреть, какой моделью отвечали."""

    list_display = ("id", "conversation", "role", "model", "created_at")
    list_filter = ("role",)
