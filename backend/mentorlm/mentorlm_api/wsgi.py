"""WSGI-точка входа: отдаёт `application` для синхронного сервера."""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mentorlm_api.settings')

application = get_wsgi_application()
