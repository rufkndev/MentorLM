from django.contrib import admin

from .models import Usage


@admin.register(Usage)
class UsageAdmin(admin.ModelAdmin):
    list_display = ("user", "day", "request_count", "tokens_in", "tokens_out", "cost_rub")
    list_filter = ("day",)
    search_fields = ("user__email", "user__clerk_id")
