"""Админка переписки: просмотр диалогов, сообщений и вложений для поддержки."""

from django.contrib import admin

from .models import Attachment, Conversation, Message


class MessageInline(admin.TabularInline):
    """Сообщения прямо на странице диалога."""

    model = Message
    extra = 0


class AttachmentInline(admin.TabularInline):
    """Вложения сообщения — с извлечённым текстом, который и ушёл в промпт.

    Только чтение: сам файл мы не храним, а `extracted_text` — это ровно то,
    что модель прочитала в прошлых ходах (`ai.context`). Правка задним числом
    сделала бы диалог невоспроизводимым.
    """

    model = Attachment
    extra = 0
    can_delete = False
    fields = ("filename", "content_type", "size", "extracted_text", "created_at")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None) -> bool:
        return False


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    """Диалоги с фильтром по режиму и поиском по владельцу."""

    list_display = ("id", "user", "mode", "title", "updated_at")
    list_filter = ("mode",)
    search_fields = ("title", "user__email")
    list_select_related = ("user",)
    inlines = (MessageInline,)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    """Плоский список сообщений — удобно смотреть, какой моделью отвечали.

    Поиск по тексту нужен ровно для одного: человек прислал в поддержку цитату
    ответа, и найти его можно только по содержимому.
    """

    list_display = ("id", "conversation", "role", "model", "attachments_count", "created_at")
    list_filter = ("role", "created_at")
    search_fields = ("content", "conversation__user__email")
    date_hierarchy = "created_at"
    list_select_related = ("conversation",)
    autocomplete_fields = ("conversation",)
    inlines = (AttachmentInline,)

    def get_queryset(self, request):
        from django.db.models import Count

        return super().get_queryset(request).annotate(_attachments=Count("attachments"))

    @admin.display(description="Вложений", ordering="_attachments")
    def attachments_count(self, obj) -> int:
        return obj._attachments


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    """Вложения списком — чтобы найти файл, не зная, в каком он диалоге.

    Только чтение по той же причине, что и в inline: это след загрузки, а не
    настройка. Ищем по имени файла и по владельцу.
    """

    list_display = ("filename", "content_type", "size", "text_chars", "message", "created_at")
    list_filter = ("content_type", "created_at")
    search_fields = ("filename", "message__conversation__user__email")
    date_hierarchy = "created_at"
    list_select_related = ("message",)

    @admin.display(description="Символов текста")
    def text_chars(self, obj) -> int:
        """Сколько текста реально извлеклось — 0 и есть «файл не прочитался»."""
        return len(obj.extracted_text)

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False
