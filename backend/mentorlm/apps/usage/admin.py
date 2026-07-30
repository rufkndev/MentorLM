"""Админка расхода: дневные агрегаты и подробный журнал ИИ-запросов."""

from django.contrib import admin

from .models import Usage, UsageEvent


@admin.register(Usage)
class UsageAdmin(admin.ModelAdmin):
    """Дневной срез: сколько запросов и денег ушло по режимам."""

    list_display = (
        "user",
        "day",
        "mode",
        "request_count",
        "tokens_in",
        "tokens_out",
        "web_search_calls",
        "billable_tokens",
    )
    list_filter = ("day", "mode")
    search_fields = ("user__email", "user__clerk_id")


@admin.register(UsageEvent)
class UsageEventAdmin(admin.ModelAdmin):
    """Журнал запросов — по нему считаются квоты, поэтому только для чтения."""

    list_display = (
        "user",
        "created_at",
        "mode",
        "scenario",
        "model",
        "tokens_in",
        "tokens_out",
        "web_search_calls",
        "billable_tokens",
        "conversation",
    )
    list_filter = ("mode", "model", "created_at")
    search_fields = ("user__email", "user__clerk_id")
    readonly_fields = ("created_at",)
