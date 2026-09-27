"""Конфиг, подменяющий `django.contrib.admin` на админку MentorLM.

Отдельным модулем, а не рядом с `CoreConfig`: Django ищет «конфиг приложения» по
всем классам модуля и падает, если их больше одного, — а здесь их неизбежно два
(наш и импортированный родитель).

Приложение остаётся тем же: `name` унаследован от `AdminConfig`, меняется только
класс `admin.site`, поэтому все `@admin.register` по приложениям продолжают
работать без изменений. Зачем свой сайт — см. `apps/core/admin_site.py`.
"""

from django.contrib.admin.apps import AdminConfig


class MentorLMAdminConfig(AdminConfig):
    default_site = "apps.core.admin_site.MentorLMAdminSite"
