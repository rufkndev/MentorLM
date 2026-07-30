"""Админка пользователей: профиль-зеркало Clerk с настройками и тарифом."""

from django.contrib import admin

from .models import UserProfile, UserSettings


class UserSettingsInline(admin.StackedInline):
    """Настройки прямо на странице профиля — их всегда ровно одна запись."""

    model = UserSettings
    extra = 0


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    """Профили с поиском по Clerk-id и почте."""

    list_display = ("clerk_id", "email", "effective_plan", "created_at")
    search_fields = ("clerk_id", "email")
    inlines = (UserSettingsInline,)

    @admin.display(description="Тариф")
    def effective_plan(self, obj) -> str:
        """Действующий тариф — считается по подпискам, в профиле не хранится."""
        from apps.billing.plans import effective_plan

        return effective_plan(obj)


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    """Плоский список настроек — удобно сверять массовые значения."""

    list_display = ("user", "creativity", "context_depth", "theme")
