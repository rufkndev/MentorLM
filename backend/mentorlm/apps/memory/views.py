from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserMemoryFact
from .serializers import UserMemoryFactSerializer


class MemoryFactListView(generics.ListAPIView):
    """GET /api/memory/facts/ — список сохранённых фактов; DELETE — очистить все."""

    serializer_class = UserMemoryFactSerializer

    def get_queryset(self):
        return UserMemoryFact.objects.filter(user=self.request.user)

    def delete(self, request, *args, **kwargs):
        self.get_queryset().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MemoryFactDetailView(APIView):
    """DELETE /api/memory/facts/{id}/ — удалить один факт."""

    def delete(self, request, pk):
        deleted, _ = UserMemoryFact.objects.filter(
            user=request.user, pk=pk
        ).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
