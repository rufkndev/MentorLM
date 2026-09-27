"""Админка пользователей: учётные записи, их настройки, тариф и сессии."""

from datetime import datetime

from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html, format_html_join

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
        "quotas",
        "consent_accepted_at",
        "consent_policy_version",
        "consent_ip",
        "last_login_at",
        "created_at",
        "updated_at",
    )

    # Раскладка под самый частый разбор обращения: сверху кто это и что с
    # доступом, сразу за ним — расход по квотам, и только потом юридическое и
    # служебное. Порядок соответствует порядку вопросов, с которыми приходят.
    fieldsets = (
        (None, {"fields": ("email", "password", "is_active", "email_verified")}),
        ("Тариф и квоты", {"fields": ("quotas",)}),
        (
            "Согласие на обработку ПДн (152-ФЗ)",
            {
                "fields": (
                    "consent_accepted_at",
                    "consent_policy_version",
                    "consent_ip",
                ),
            },
        ),
        ("Служебное", {"fields": ("last_login_at", "created_at", "updated_at")}),
    )

    @admin.display(description="Тариф")
    def effective_plan(self, obj) -> str:
        """Действующий тариф — считается по подпискам, в профиле не хранится."""
        from apps.billing.plans import effective_plan

        return effective_plan(obj)

    @admin.display(description="Расход квот")
    def quotas(self, obj):
        """Остаток квот по режимам — ответ на «почему у меня кончился лимит».

        Считаем тем же `mode_usage_report`, что отдаётся в ЛК и в конце стрима:
        поддержка обязана видеть ровно те проценты, которые видит человек, —
        иначе разговор идёт про разные числа. Окна показываем оба и раздельно,
        по той же причине, по которой их не сводит в одну шкалу интерфейс:
        упереться можно в любое.
        """
        if obj.pk is None:
            return "—"

        from apps.billing.guard import mode_usage_report
        from apps.billing.limits import QUOTA_WINDOWS, limits_for
        from apps.billing.plans import effective_plan
        from apps.conversations.models import Conversation

        plan = effective_plan(obj)
        rows = []
        for mode, _ in Conversation.Mode.choices:
            report = mode_usage_report(obj, mode, plan=plan)
            cells = []
            for window in QUOTA_WINDOWS:
                view = report["windows"][window]
                # Время сброса есть только у начатого окна: пустому сбрасывать
                # нечего, и «сброс сейчас» вводило бы в заблуждение.
                resets = view["resets_at"]
                when = (
                    timezone.localtime(datetime.fromisoformat(resets)).strftime("%d.%m %H:%M")
                    if resets
                    else "—"
                )
                cells.append((view["window_label"], view["used_pct"], when))
            rows.append(
                (
                    report["label"],
                    format_html_join(
                        "",
                        "<td style='padding:2px 12px 2px 0'>{}: <b>{}%</b> "
                        "<span style='opacity:.6'>(сброс {})</span></td>",
                        cells,
                    ),
                )
            )

        return format_html(
            "<div>Тариф: <b>{}</b></div><table style='margin-top:6px'>{}</table>",
            limits_for(plan)["label"],
            format_html_join(
                "", "<tr><td style='padding:2px 16px 2px 0'><b>{}</b></td>{}</tr>", rows
            ),
        )


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    """Плоский список настроек — удобно сверять массовые значения."""

    list_display = ("user", "creativity", "context_depth", "theme")
    list_select_related = ("user",)


@admin.register(RefreshToken)
class RefreshTokenAdmin(admin.ModelAdmin):
    """Активные сессии — только чтение: выпускает и гасит их users.tokens."""

    list_display = ("user", "created_at", "expires_at", "revoked_at", "ip")
    list_filter = ("revoked_at",)
    search_fields = ("user__email", "ip")
    list_select_related = ("user",)
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
    list_select_related = ("user",)
    readonly_fields = tuple(f.name for f in EmailToken._meta.fields)

    def has_add_permission(self, request) -> bool:
        return False
