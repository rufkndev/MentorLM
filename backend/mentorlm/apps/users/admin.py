"""Админка пользователей: учётные записи, их настройки, тариф и сессии."""

from django.contrib import admin

from .models import EmailToken, RefreshToken, UserProfile, UserSettings


class UserSettingsInline(admin.StackedInline):
    """Настройки прямо на странице профиля — их всегда ровно одна запись."""

    model = UserSettings
    extra = 0


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    """Учётные записи с поиском по почте."""

    list_display = ("email", "effective_plan", "is_active", "last_login_at", "created_at")
    list_filter = ("is_active", "email_verified")
    search_fields = ("email",)
    inlines = (UserSettingsInline,)

    # Хэш пароля и данные о согласии показываем, но редактировать не даём:
    # правка хэша руками ломает вход, а согласие — юридический факт, а не
    # настройка (152-ФЗ). Пароль меняется только самим пользователем.
    readonly_fields = (
        "password",
        "consent_accepted_at",
        "consent_policy_version",
        "consent_ip",
        "last_login_at",
        "created_at",
        "updated_at",
    )

    @admin.display(description="Тариф")
    def effective_plan(self, obj) -> str:
        """Действующий тариф — считается по подпискам, в профиле не хранится."""
        from apps.billing.plans import effective_plan

        return effective_plan(obj)


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    """Плоский список настроек — удобно сверять массовые значения."""

    list_display = ("user", "creativity", "context_depth", "theme")


@admin.register(RefreshToken)
class RefreshTokenAdmin(admin.ModelAdmin):
    """Активные сессии — только чтение: выпускает и гасит их users.tokens."""

    list_display = ("user", "created_at", "expires_at", "revoked_at", "ip")
    list_filter = ("revoked_at",)
    search_fields = ("user__email", "ip")
    # Самого токена тут нет и быть не может — в базе лежит только его хэш.
    readonly_fields = tuple(f.name for f in RefreshToken._meta.fields)

    def has_add_permission(self, request) -> bool:
        return False


@admin.register(EmailToken)
class EmailTokenAdmin(admin.ModelAdmin):
    """Ссылки из писем — только чтение, для разбора «письмо не пришло».

    Видно, было ли письмо вообще заказано и переходили ли по ссылке. Самой
    ссылки здесь нет: в базе лежит только её хэш, и восстановить её нельзя —
    в том числе поддержке. Помочь можно единственным способом: попросить
    запросить письмо заново.
    """

    list_display = ("user", "purpose", "created_at", "expires_at", "used_at")
    list_filter = ("purpose",)
    search_fields = ("user__email", "email")
    readonly_fields = tuple(f.name for f in EmailToken._meta.fields)

    def has_add_permission(self, request) -> bool:
        return False
