"""Админка расхода: дневные агрегаты и подробный журнал ИИ-запросов.

Обе таблицы здесь только читают. Причина разная, и поэтому разрешения разные:

* `UsageEvent` — источник правды для квот. `billing.guard` считает по нему
  скользящие окна, то есть правка строки в админке молча меняет остаток лимита
  у пользователя, а удаление — возвращает ему потраченное. Запрещено всё,
  включая удаление: журнал append-only не только на словах.
* `Usage` — дневной роллап, который считает `record_usage`. В контуре лимитов не
  участвует, поэтому удалять строки можно (разовая чистка аналитики ничего не
  ломает), а дописывать и править — нет: значения получаются из журнала, и
  расхождение с ним означало бы, что цифрам в этой таблице нельзя верить.
"""

from django.contrib import admin

from .models import Usage, UsageEvent


@admin.register(Usage)
class UsageAdmin(admin.ModelAdmin):
    """Дневной срез: сколько запросов и денег ушло по режимам."""

    list_display = (
        "user",
        "day",
        "mode",
        "request_count",
        "tokens_in",
        "tokens_out",
        "web_search_calls",
        "billable_tokens",
    )
    list_filter = ("day", "mode")
    search_fields = ("user__email",)
    list_select_related = ("user",)

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False


@admin.register(UsageEvent)
class UsageEventAdmin(admin.ModelAdmin):
    """Журнал запросов — по нему считаются квоты, поэтому только для чтения."""

    list_display = (
        "user",
        "created_at",
        "mode",
        "scenario",
        "model",
        "tokens_in",
        "tokens_out",
        "web_search_calls",
        "billable_tokens",
        "conversation",
    )
    list_filter = ("mode", "model", "degraded", "thinking", "created_at")
    search_fields = ("user__email",)
    date_hierarchy = "created_at"
    list_select_related = ("user", "conversation")

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
