"""ASGI-точка входа: отдаёт `application` для uvicorn и других ASGI-серверов."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mentorlm_api.settings')

application = get_asgi_application()
