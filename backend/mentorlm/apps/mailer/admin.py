"""Админка почты: журнал отправок — «письмо не пришло» и доказательство ФЗ-376."""

from django.contrib import admin
from django.utils.html import format_html

from .models import SentLetter


@admin.register(SentLetter)
class SentLetterAdmin(admin.ModelAdmin):
    """Только чтение: это след операции, а не настройка.

    Фильтр по статусу — главный рабочий инструмент: список ошибок за сутки и
    есть список писем, которые до людей не дошли.
    """

    list_display = ("created_at", "to_email", "letter", "status", "problem")
    list_filter = ("status", "letter", "created_at")
    search_fields = ("to_email", "subject", "error")
    date_hierarchy = "created_at"
    readonly_fields = tuple(f.name for f in SentLetter._meta.fields)

    @admin.display(description="Причина")
    def problem(self, obj):
        """Ошибка транспорта одной строкой — чтобы не открывать каждую запись."""
        if not obj.error:
            return "—"
        return format_html(
            '<span style="color:var(--error-fg)">{}</span>',
            obj.error[:120],
        )

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
