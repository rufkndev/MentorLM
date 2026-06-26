from django.contrib import admin

from .models import UserProfile, UserSettings


class UserSettingsInline(admin.StackedInline):
    model = UserSettings
    extra = 0


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("clerk_id", "email", "plan", "created_at")
    list_filter = ("plan",)
    search_fields = ("clerk_id", "email")
    inlines = (UserSettingsInline,)


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    list_display = ("user", "default_model", "temperature", "interface_lang", "theme")
