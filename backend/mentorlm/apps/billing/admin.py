from django.contrib import admin

from .models import Subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "plan", "status", "provider", "current_period_end", "created_at")
    list_filter = ("plan", "status", "provider")
    search_fields = ("user__email", "user__clerk_id", "external_id")
