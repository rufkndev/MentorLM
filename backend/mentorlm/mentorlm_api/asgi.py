"""ASGI-точка входа: отдаёт `application` для uvicorn и других ASGI-серверов."""

import os

from django.core.asgi import get_asgi_application

# Прод передаёт mentorlm_api.settings.prod через окружение (compose).
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mentorlm_api.settings.dev')

application = get_asgi_application()
