from django.contrib import admin

from .models import UserProfile, UserSettings


class UserSettingsInline(admin.StackedInline):
    model = UserSettings
    extra = 0


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("clerk_id", "email", "effective_plan", "created_at")
    search_fields = ("clerk_id", "email")
    inlines = (UserSettingsInline,)

    @admin.display(description="Тариф")
    def effective_plan(self, obj) -> str:
        """Актуальный тариф по подпискам (считается на лету, кэша нет)."""
        from apps.billing.plans import effective_plan

        return effective_plan(obj)


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    list_display = ("user", "creativity", "context_depth", "theme")
