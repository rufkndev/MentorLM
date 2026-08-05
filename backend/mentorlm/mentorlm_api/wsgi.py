"""WSGI-точка входа: отдаёт `application` для синхронного сервера."""

import os

from django.core.wsgi import get_wsgi_application

# Прод передаёт mentorlm_api.settings.prod через окружение (compose).
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mentorlm_api.settings.dev')

application = get_wsgi_application()
