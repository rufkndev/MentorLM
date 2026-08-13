"""Служебные вьюхи проекта — пока только пробник доступности."""

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """GET /api/health/ — публичный пробник для мониторинга и compose."""

    # Открыт всем: проба контейнера ходит сюда без токена.
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        """Отвечает, что процесс жив (БД не проверяет)."""
        return Response({"status": "ok"})
