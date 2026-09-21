"""Конфиг приложения `billing` — тарифы, лимиты и подписки."""

from django.apps import AppConfig
from django.core.checks import register


class BillingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.billing"

    def ready(self):
        # Каталог экономики правят руками, а ошибки в нём тихие — проверяем его
        # на старте, до первого запроса. Импорт здесь, а не наверху: модуль
        # проверок тянет модели и ai-слой, которых на момент импорта конфига ещё
        # нет.
        from .checks import check_economics

        register(check_economics)
