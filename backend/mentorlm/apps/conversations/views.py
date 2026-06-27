import json

from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.limits import limits_for
from apps.usage.services import record_usage

from . import services
from .models import Conversation, Message
from .serializers import ConversationDetailSerializer, ConversationSerializer


class ConversationListCreateView(generics.ListCreateAPIView):
    """GET /api/conversations/?mode=chat — список; POST — новый пустой диалог."""

    serializer_class = ConversationSerializer

    def get_queryset(self):
        qs = Conversation.objects.filter(user=self.request.user)
        mode = self.request.query_params.get("mode")
        if mode:
            qs = qs.filter(mode=mode)
        return qs

    def perform_create(self, serializer):
        mode = self.request.data.get("mode", Conversation.Mode.CHAT)
        if mode not in Conversation.Mode.values:
            raise ValidationError({"mode": "Недопустимый режим."})
        serializer.save(user=self.request.user, mode=mode)


class ConversationDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET — диалог с историей; PATCH — переименовать/закрепить; DELETE — удалить."""

    serializer_class = ConversationDetailSerializer

    def get_queryset(self):
        return Conversation.objects.filter(user=self.request.user)


class MessageCreateView(APIView):
    """POST /api/conversations/{id}/messages/ — сообщение + потоковый ответ (SSE)."""

    def post(self, request, pk):
        conversation = (
            Conversation.objects.filter(user=request.user, pk=pk).first()
        )
        if conversation is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        content = (request.data.get("content") or "").strip()
        if not content:
            raise ValidationError({"content": "Пустое сообщение."})
        scenario_prompt = request.data.get("system_prompt", "") or ""

        user = request.user
        user_settings = user.settings
        plan_limits = limits_for(user.plan)

        # 1. Сохраняем сообщение пользователя; первое — задаёт заголовок чата.
        Message.objects.create(
            conversation=conversation,
            role=Message.Role.USER,
            content=content,
        )
        if not conversation.title:
            conversation.title = content[:40]
            conversation.save(update_fields=["title", "updated_at"])

        # 2. Готовим запрос к модели до старта стрима.
        model = services.resolve_model(user_settings)
        system_prompt = services.build_system_prompt(
            user_settings, conversation.mode, scenario_prompt
        )
        history = services.build_context(conversation, user_settings, plan_limits)
        messages = [{"role": "system", "content": system_prompt}, *history]

        def event_stream():
            usage: dict = {}
            assistant_content = ""
            try:
                deltas = services.stream_chat_completion(
                    messages,
                    model=model,
                    temperature=user_settings.temperature,
                    response_length=user_settings.response_length,
                    usage=usage,
                )
                for delta in deltas:
                    assistant_content += delta
                    yield _sse({"delta": delta})
            except Exception as exc:  # noqa: BLE001 — отдаём ошибку клиенту
                yield _sse({"error": str(exc)})
            finally:
                message_id = None
                if assistant_content:
                    msg = Message.objects.create(
                        conversation=conversation,
                        role=Message.Role.ASSISTANT,
                        content=assistant_content,
                        model=model,
                    )
                    message_id = msg.id
                    conversation.updated_at = timezone.now()
                    conversation.save(update_fields=["updated_at"])
                    record_usage(
                        user,
                        tokens_in=usage.get("prompt_tokens", 0),
                        tokens_out=usage.get("completion_tokens", 0),
                        model=model,
                    )
                yield _sse({"done": True, "message_id": message_id})

        response = StreamingHttpResponse(
            event_stream(), content_type="text/event-stream"
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
