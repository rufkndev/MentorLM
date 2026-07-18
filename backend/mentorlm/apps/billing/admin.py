from django.contrib import admin

from .models import Subscription
from .plans import active_subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "plan",
        "status",
        "provider",
        "current_period_end",
        "is_alive",
        "created_at",
    )
    list_filter = ("plan", "status", "provider")
    search_fields = ("user__email", "user__clerk_id", "external_id")

    @admin.display(boolean=True, description="Действует сейчас")
    def is_alive(self, obj) -> bool:
        """Даёт ли эта подписка тариф прямо сейчас (учёт статуса и срока)."""
        alive = active_subscription(obj.user)
        return alive is not None and alive.pk == obj.pk
