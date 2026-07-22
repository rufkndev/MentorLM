import json
import time
from datetime import timedelta

from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai import service as ai_service
from apps.billing.guard import (
    LimitExceeded,
    acquire_generation_lock,
    preflight,
    release_generation_lock,
)
from apps.billing.limits import REQUEST_TIMEOUT_SECONDS, limits_for
from apps.billing.plans import effective_plan
from apps.memory.services import extract_facts_in_background
from apps.usage.services import record_usage
from apps.users.models import UserProfile

from .attachments import attachment_error, extract_text
from .models import Attachment, Conversation, Message
from .serializers import ConversationDetailSerializer, ConversationSerializer


def _purge_expired(user) -> None:
    """Ленивая чистка: удалить диалоги старше настройки хранения пользователя.

    Автоудаление по последней активности (updated_at). retention=0 — не удалять.
    Дешёвых фоновых задач в MVP нет, поэтому чистим при обращении к списку чатов.
    """
    days = getattr(user.settings, "chat_retention_days", 0)
    if not days:
        return
    cutoff = timezone.now() - timedelta(days=days)
    Conversation.objects.filter(user=user, updated_at__lt=cutoff).delete()


class ConversationListCreateView(generics.ListCreateAPIView):
    """GET /api/conversations/?mode=chat — список; POST — новый; DELETE — все."""

    serializer_class = ConversationSerializer

    def get_queryset(self):
        qs = Conversation.objects.filter(user=self.request.user)
        mode = self.request.query_params.get("mode")
        if mode:
            qs = qs.filter(mode=mode)
        return qs

    def list(self, request, *args, **kwargs):
        _purge_expired(request.user)
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        mode = self.request.data.get("mode", Conversation.Mode.CHAT)
        if mode not in Conversation.Mode.values:
            raise ValidationError({"mode": "Недопустимый режим."})
        serializer.save(user=self.request.user, mode=mode)

    def delete(self, request, *args, **kwargs):
        """Удалить все диалоги пользователя (опасная зона настроек)."""
        Conversation.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        # Системный промпт выбирает бэк по mode + scenario_id; клиент его не задаёт.
        scenario_id = request.data.get("scenario_id") or None

        # Вложения (multipart): валидируем политику тарифа/потолков ДО извлечения
        # и сохранения. Сами файлы не храним — только извлечённый текст и
        # метаданные (см. attachments).
        files = request.FILES.getlist("files")
        max_attachments = limits_for(effective_plan(request.user))["max_attachments"]
        err = attachment_error(files, max_attachments)
        if err:
            code, message, http_status = err
            return Response({"code": code, "message": message}, status=http_status)
        extracted: list[tuple[str, str, int, str]] = []
        for f in files:
            extracted.append(
                (f.name, f.content_type or "", f.size, extract_text(f.name, f.read()))
            )

        if not content and not extracted:
            raise ValidationError({"content": "Пустое сообщение."})

        user = request.user

        # В подсчёт длины ввода включаем и текст вложений — он тоже уйдёт модели.
        attach_text = "\n\n".join(text for *_, text in extracted)
        preflight_text = f"{content}\n\n{attach_text}" if attach_text else content

        # 0. Лок «идёт генерация»: один пользователь — один активный ответ. Берём
        #    ДО preflight, поэтому проверка лимитов и последующее списание расхода
        #    идут под локом — параллельные запросы одного юзера не могут вместе
        #    проскочить лимит (overshoot). Снимаем лок в finally стрима, а на
        #    ранних выходах — явно. _GEN_LOCK_TTL страхует от смерти воркера.
        if not acquire_generation_lock(user):
            return Response(
                {
                    "code": "generation_in_progress",
                    "message": "Дождитесь окончания предыдущего ответа.",
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            # 1. Preflight-лимиты ДО сохранения сообщения — чтобы не плодить
            #    осиротевшие сообщения без ответа. Отдаём JSON с кодом/статусом до
            #    старта SSE: фронтовый api.stream увидит non-200 и покажет апселл.
            try:
                decision = preflight(
                    user,
                    mode=conversation.mode,
                    scenario=scenario_id,
                    input_text=preflight_text,
                )
            except LimitExceeded as exc:
                release_generation_lock(user)
                return Response(
                    {"code": exc.code, "message": exc.message, **exc.extra},
                    status=exc.status,
                )
            # Квота исчерпана, но есть grace-запросы → отвечаем на дешёвой модели
            # и подсвечиваем это плашкой на фронте (can_upgrade — не на топ-тарифе).
            degraded = decision == "degrade"
            can_upgrade = effective_plan(user) != UserProfile.Plan.PRO

            # 2. Сохраняем сообщение пользователя и его вложения; первое сообщение
            #    задаёт заголовок чата (текст, а если его нет — имя первого файла).
            user_msg = Message.objects.create(
                conversation=conversation,
                role=Message.Role.USER,
                content=content,
            )
            for name, ctype, size, text in extracted:
                Attachment.objects.create(
                    message=user_msg,
                    filename=name,
                    content_type=ctype,
                    size=size,
                    extracted_text=text,
                )
            if not conversation.title:
                conversation.title = content[:40] or (
                    extracted[0][0] if extracted else ""
                )
                conversation.save(update_fields=["title", "updated_at"])

            # 3. Готовим запрос к модели до старта стрима (выбор провайдера/промпта
            #    и сборка контекста — в едином ИИ-слое apps.ai).
            ai = ai_service.run_conversation_stream(
                conversation, scenario_id, user, degrade=degraded
            )
            model = ai.model
        except Exception:
            # Любая ошибка до старта стрима — снять лок, иначе повиснет до TTL.
            release_generation_lock(user)
            raise

        def event_stream():
            usage = ai.usage
            assistant_content = ""
            started = time.monotonic()
            try:
                # Плашка деградации — до текста ответа, чтобы фронт показал её сразу.
                if degraded:
                    yield _sse({"degraded": True, "can_upgrade": can_upgrade})
                for delta in ai.deltas:
                    # Wall-clock таймаут генерации: обрываем между дельтами, если
                    # ответ идёт дольше потолка (зависший/слишком долгий стрим).
                    if time.monotonic() - started > REQUEST_TIMEOUT_SECONDS:
                        yield _sse({"error": "Превышено время ответа. Попробуйте снова."})
                        break
                    assistant_content += delta
                    yield _sse({"delta": delta})
            except Exception as exc:  # noqa: BLE001 — отдаём ошибку клиенту
                yield _sse({"error": str(exc)})
            finally:
                try:
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
                            mode=conversation.mode,
                            scenario=scenario_id or "",
                            conversation=conversation,
                            model=model,
                            tokens_in=usage.get("prompt_tokens", 0),
                            tokens_out=usage.get("completion_tokens", 0),
                            web_search_calls=usage.get("web_search_calls", 0),
                            degraded=degraded,
                        )
                        # Глобальная память: в фоне извлекаем устойчивые факты о
                        # пользователе (если включена автопамять). Не блокирует ответ.
                        extract_facts_in_background(user, conversation)
                    yield _sse({"done": True, "message_id": message_id})
                finally:
                    # Снимаем лок генерации в самом конце — после списания расхода,
                    # чтобы следующий запрос увидел уже обновлённые лимиты.
                    release_generation_lock(user)

        response = StreamingHttpResponse(
            event_stream(), content_type="text/event-stream"
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
