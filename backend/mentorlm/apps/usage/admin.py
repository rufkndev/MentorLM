from django.contrib import admin

from .models import Usage, UsageEvent


@admin.register(Usage)
class UsageAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "day",
        "mode",
        "request_count",
        "tokens_in",
        "tokens_out",
        "cost_rub",
    )
    list_filter = ("day", "mode")
    search_fields = ("user__email", "user__clerk_id")


@admin.register(UsageEvent)
class UsageEventAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "created_at",
        "mode",
        "scenario",
        "model",
        "tokens_in",
        "tokens_out",
        "cost_usd",
        "cost_rub",
        "conversation",
    )
    list_filter = ("mode", "model", "created_at")
    search_fields = ("user__email", "user__clerk_id")
    readonly_fields = ("created_at",)
