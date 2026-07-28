import json
import logging
import time
from datetime import timedelta

from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai import service as ai_service
from apps.ai.context import count_tokens
from apps.billing.guard import (
    LimitExceeded,
    acquire_generation_lock,
    clear_stop,
    generation_in_progress,
    preflight,
    release_generation_lock,
    request_stop,
    stop_requested,
)
from apps.billing.limits import limits_for, request_timeout
from apps.billing.plans import effective_plan
from apps.memory.services import extract_facts_in_background
from apps.usage.services import record_usage
from apps.users.models import UserProfile

from .attachments import attachment_error, extract_text
from .models import Attachment, Conversation, Message
from .serializers import ConversationDetailSerializer, ConversationSerializer

logger = logging.getLogger(__name__)


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

    def retrieve(self, request, *args, **kwargs):
        """История диалога + признак того, что ответ сейчас пишется.

        `generating` нужен фронту после перезагрузки страницы: живого стрима в
        браузере уже нет, а ответ на сервере ещё дописывается — по этому флагу
        экран дожидается его и перечитывает историю, вместо того чтобы навсегда
        показывать диалог без ответа.
        """
        response = super().retrieve(request, *args, **kwargs)
        response.data["generating"] = generation_in_progress(request.user)
        return response


# Отказы, которые сохраняем в диалог отдельным сообщением-уведомлением: это
# устойчивое состояние тарифа, а не разовая осечка, и плашка с апселлом должна
# оставаться в чате, пока пользователь не перейдёт на тариф выше.
PERSISTED_LIMIT_CODES = {"mode_quota_exceeded", "feature_locked"}


def _save_user_message(conversation, content: str, extracted) -> Message:
    """Сохранить сообщение пользователя с вложениями; первое — задаёт заголовок.

    Заголовок берём из текста, а если его нет — из имени первого файла.
    """
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
        conversation.title = content[:40] or (extracted[0][0] if extracted else "")
        conversation.save(update_fields=["title", "updated_at"])
    return user_msg


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
        # «Повторить» после сбоя: отвечаем на ПОСЛЕДНИЙ вопрос пользователя, не
        # создавая его копию. Неудачный хвост (частичный ответ, уведомление)
        # убираем — иначе в диалоге копился бы мусор от каждой попытки.
        retry = bool(request.data.get("retry"))

        if retry:
            last_user = (
                conversation.messages.filter(role=Message.Role.USER).last()
            )
            if last_user is None:
                raise ValidationError({"retry": "В диалоге нет вопроса."})
            conversation.messages.filter(id__gt=last_user.id).delete()
            content = last_user.content
            extracted = [
                (a.filename, a.content_type, a.size, a.extracted_text)
                for a in last_user.attachments.all()
            ]
        else:
            # Вложения (multipart): валидируем политику тарифа/потолков ДО
            # извлечения и сохранения. Сами файлы не храним — только извлечённый
            # текст и метаданные (см. attachments).
            files = request.FILES.getlist("files")
            max_attachments = limits_for(effective_plan(request.user))[
                "max_attachments"
            ]
            err = attachment_error(files, max_attachments)
            if err:
                code, message, http_status = err
                return Response(
                    {"code": code, "message": message}, status=http_status
                )
            extracted = []
            for f in files:
                extracted.append(
                    (
                        f.name,
                        f.content_type or "",
                        f.size,
                        extract_text(f.name, f.read()),
                    )
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
        # Флаг «стоп» от предыдущего ответа не должен обрывать новый.
        clear_stop(user)

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
                # Упор в тариф — это состояние диалога, а не разовая осечка:
                # сохраняем вопрос пользователя и уведомление, чтобы плашка с
                # апселлом осталась в чате после ухода на /billing и возврата.
                # Разовые отказы (частим, слишком длинный ввод) не сохраняем —
                # их достаточно показать один раз.
                if exc.code in PERSISTED_LIMIT_CODES:
                    if not retry:  # при повторе вопрос уже в диалоге
                        _save_user_message(conversation, content, extracted)
                    notice = Message.objects.create(
                        conversation=conversation,
                        role=Message.Role.ASSISTANT,
                        kind=Message.Kind.NOTICE,
                        content=exc.message,
                        meta={
                            "code": exc.code,
                            "can_upgrade": (
                                effective_plan(user) != UserProfile.Plan.PRO
                            ),
                            **exc.extra,
                        },
                    )
                    return Response(
                        {
                            "code": exc.code,
                            "message": exc.message,
                            "notice_id": notice.id,
                            **exc.extra,
                        },
                        status=exc.status,
                    )
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
            #    При «повторить» вопрос уже в диалоге — второй раз не создаём.
            if not retry:
                _save_user_message(conversation, content, extracted)

            # Сценарий запоминаем на самом диалоге: он его свойство, а не режима.
            # Вернувшись в чат (в т.ч. с другого устройства), пользователь
            # застаёт тот же пресет, с которым его вёл.
            if scenario_id and conversation.scenario_id != scenario_id:
                conversation.scenario_id = scenario_id
                conversation.save(update_fields=["scenario_id"])

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

        timeout_seconds = request_timeout(conversation.mode)

        def event_stream():
            usage = ai.usage
            assistant_content = ""
            started = time.monotonic()
            # Клиент оборвал соединение — после этого отдавать события уже некуда.
            client_gone = False
            # Пользователь нажал «Стоп»: не ошибка — сохраняем то, что успели.
            stopped = False
            try:
                # Плашка деградации — до текста ответа, чтобы фронт показал её сразу.
                if degraded:
                    yield _sse({"degraded": True, "can_upgrade": can_upgrade})
                for delta in ai.deltas:
                    # Кнопка «Стоп» на фронте (POST .../stop/): прекращаем читать
                    # ответ модели и штатно закрываем стрим — уже сгенерированная
                    # часть сохранится ниже, лок снимется сразу.
                    if stop_requested(user):
                        stopped = True
                        break
                    # Wall-clock таймаут генерации: обрываем между дельтами, если
                    # ответ идёт дольше потолка режима (зависший стрим).
                    if time.monotonic() - started > timeout_seconds:
                        yield _sse({"error": "Превышено время ответа. Попробуйте снова."})
                        break
                    assistant_content += delta
                    yield _sse({"delta": delta})
            except GeneratorExit:
                # Соединение закрылось (вкладка/сеть/abort на фронте). Дальше
                # yield запрещён, но сохранить ответ и снять лок обязаны.
                client_gone = True
            except Exception:  # noqa: BLE001 — стрим не должен падать молча
                # В лог — полный traceback (иначе такие сбои не расследовать),
                # пользователю — нейтральный текст без внутренностей провайдера.
                logger.exception(
                    "Сбой генерации: conversation=%s mode=%s model=%s",
                    conversation.pk,
                    conversation.mode,
                    model,
                )
                yield _sse(
                    {"error": "Не удалось дописать ответ. Попробуйте ещё раз."}
                )
            finally:
                try:
                    message_id = None
                    if assistant_content:
                        msg = Message.objects.create(
                            conversation=conversation,
                            role=Message.Role.ASSISTANT,
                            content=assistant_content,
                            model=model,
                            # Плашки ответа храним вместе с ним, иначе при
                            # возврате в чат они пропадают: ответ на упрощённой
                            # модели и оборванная генерация — часть его истории.
                            meta={
                                **(
                                    {"degraded": True, "can_upgrade": can_upgrade}
                                    if degraded
                                    else {}
                                ),
                                **({"stopped": True} if stopped else {}),
                            },
                        )
                        message_id = msg.id
                        conversation.updated_at = timezone.now()
                        conversation.save(update_fields=["updated_at"])
                        # На прерванном стриме провайдер не успевает отдать usage —
                        # оцениваем выход по уже полученному тексту, иначе расход
                        # (реальные деньги) потерялся бы мимо квоты.
                        tokens_out = usage.get("completion_tokens", 0) or count_tokens(
                            assistant_content, model
                        )
                        record_usage(
                            user,
                            mode=conversation.mode,
                            scenario=scenario_id or "",
                            conversation=conversation,
                            model=model,
                            tokens_in=usage.get("prompt_tokens", 0),
                            tokens_out=tokens_out,
                            web_search_calls=usage.get("web_search_calls", 0),
                            degraded=degraded,
                        )
                        # Глобальная память: в фоне извлекаем устойчивые факты о
                        # пользователе (если включена автопамять). Не блокирует ответ.
                        extract_facts_in_background(user, conversation)
                    if not client_gone:
                        yield _sse(
                            {"done": True, "message_id": message_id, "stopped": stopped}
                        )
                finally:
                    # Снимаем лок генерации в самом конце — после списания расхода,
                    # чтобы следующий запрос увидел уже обновлённые лимиты.
                    clear_stop(user)
                    release_generation_lock(user)

        response = StreamingHttpResponse(
            event_stream(), content_type="text/event-stream"
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class GenerationStopView(APIView):
    """POST /api/conversations/stop/ — остановить текущую генерацию (кнопка «Стоп»).

    Ставит флаг остановки; активный SSE-стрим увидит его между дельтами,
    сохранит уже написанную часть ответа, спишет расход и снимет лок генерации.
    Отдельный запрос, а не просто обрыв соединения: так пользователь может
    отправить следующее сообщение сразу, не дожидаясь, пока сервер заметит обрыв.
    Идемпотентен: флаг живёт до конца текущего ответа.
    """

    def post(self, request):
        request_stop(request.user)
        return Response(status=status.HTTP_202_ACCEPTED)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
