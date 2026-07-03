from django.contrib import admin

from .models import UserMemoryFact


@admin.register(UserMemoryFact)
class UserMemoryFactAdmin(admin.ModelAdmin):
    list_display = ("user", "content", "created_at", "last_used_at")
    list_filter = ("created_at",)
    search_fields = ("content", "user__email", "user__clerk_id")
    autocomplete_fields = ()
