"""HTTP-слой диалогов: список, деталь и главный эндпоинт — потоковый ответ ИИ.

Отправка сообщения проходит лок генерации и preflight-лимиты, затем отдаёт
ответ модели по SSE, а в конце сохраняет его, списывает расход и пополняет память.
"""

import json
import logging
import queue
import threading
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
    LOCK_WAIT_SECONDS,
    STOP_WAIT_SECONDS,
    LimitExceeded,
    acquire_generation_lock,
    clear_stop,
    generation_in_progress,
    mode_usage_report,
    preflight,
    release_generation_lock,
    request_stop,
    stop_requested,
    wait_generation_finished,
)
from apps.billing.limits import limits_for, request_timeout
from apps.billing.models import Plan
from apps.billing.plans import effective_plan
from apps.memory.services import extract_facts_in_background
from apps.usage.services import record_usage

from .attachments import attachment_error, extract_text
from .models import Attachment, Conversation, Message
from .serializers import ConversationDetailSerializer, ConversationSerializer

logger = logging.getLogger(__name__)


def _purge_expired(user) -> None:
    """Удалить диалоги старше срока хранения из настроек пользователя.

    Считаем по последней активности; 0 — не удалять. Фоновых задач в MVP нет,
    поэтому чистим лениво, при обращении к списку чатов.
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
        """Диалоги текущего пользователя, при желании — одного режима."""
        qs = Conversation.objects.filter(user=self.request.user)
        mode = self.request.query_params.get("mode")
        if mode:
            qs = qs.filter(mode=mode)
        return qs

    def list(self, request, *args, **kwargs):
        """Список чатов; заодно ленивая чистка просроченных."""
        _purge_expired(request.user)
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        """Создать диалог: режим проверяем сами, владельца ставим из токена."""
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
        """Только свои диалоги — чужой id даст 404."""
        return Conversation.objects.filter(user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        """История диалога плюс признак того, что ответ сейчас пишется.

        Нужен фронту после перезагрузки страницы: живого стрима в браузере уже
        нет, и по флагу экран дожидается ответа, а не показывает диалог без него.
        """
        response = super().retrieve(request, *args, **kwargs)
        response.data["generating"] = generation_in_progress(request.user)
        return response


# Пауза между «пульсами» SSE, пока модель молчит. Пульс решает сразу три задачи:
# держит соединение живым через прокси, даёт вьюхе проверить «Стоп» и таймаут, и
# — главное — обнаруживает закрытую вкладку: запись в мёртвый сокет обрывает
# генератор. Без него молчащая модель («Исследовать» ищет минутами) удерживала
# лок генерации до конца ответа, и следующий вопрос упирался в 429.
HEARTBEAT_SECONDS = 1.0

# Как часто спрашивать про «Стоп» и сверяться с потолком времени. Флаг лежит в
# общем кэше, а дельт бывают сотни в секунду — проверять каждую было бы лишним
# походом в Redis на каждый токен ответа.
CHECK_INTERVAL_SECONDS = 0.5


def _pump_deltas(deltas, inbox: queue.Queue, cancel: threading.Event) -> None:
    """Читать поток провайдера в отдельном потоке, складывая куски в очередь.

    Чтение блокирующее и прервать его нельзя, а вьюха обязана оставаться живой
    даже когда модель молчит. Поэтому чтение вынесено сюда: генератор ответа
    общается с провайдером только через очередь и в любой момент может уйти.
    """
    try:
        for delta in deltas:
            if cancel.is_set():
                break
            inbox.put(("delta", delta))
    except BaseException as exc:  # noqa: BLE001 — пробрасываем в основной поток
        inbox.put(("error", exc))
    finally:
        inbox.put(("end", None))
        # Закрываем поток провайдера: соединение с моделью освобождается, и
        # после «Стопа» генерация не продолжает жечь токены в фоне.
        close = getattr(deltas, "close", None)
        if close is not None:
            try:
                close()
            except Exception:  # noqa: BLE001 — закрытие не должно ничего ломать
                logger.debug("Не удалось закрыть поток провайдера", exc_info=True)


# Отказы, которые сохраняем в диалог отдельным сообщением-уведомлением: это
# устойчивое состояние тарифа, а не разовая осечка, и плашка с апселлом должна
# оставаться в чате, пока пользователь не перейдёт на тариф выше.
PERSISTED_LIMIT_CODES = {"mode_quota_exceeded", "feature_locked"}


def _save_user_message(conversation, content: str, extracted) -> Message:
    """Сохранить вопрос пользователя с вложениями; первый задаёт заголовок чата.

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
    """POST /api/conversations/{id}/messages/ — сообщение и потоковый ответ (SSE)."""

    def post(self, request, pk):
        """Принять вопрос, проверить лимиты и отдать ответ модели потоком."""
        conversation = (
            Conversation.objects.filter(user=request.user, pk=pk).first()
        )
        if conversation is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        content = (request.data.get("content") or "").strip()
        # Клиент шлёт только id сценария: промпт и параметры собирает бэк.
        scenario_id = request.data.get("scenario_id") or None
        # «Повторить» после сбоя: отвечаем на последний вопрос, не копируя его, и
        # убираем неудачный хвост — иначе в диалоге копился бы мусор от попыток.
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
            # Вложения проверяем по политике тарифа ДО извлечения и сохранения.
            # Файлы не храним — только извлечённый текст и метаданные.
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

        # Текст вложений тоже уйдёт модели — учитываем его в длине ввода.
        attach_text = "\n\n".join(text for *_, text in extracted)
        preflight_text = f"{content}\n\n{attach_text}" if attach_text else content

        # Лок берём ДО preflight: проверка лимитов и списание расхода идут под
        # ним, поэтому параллельные запросы одного юзера не проскочат квоту.
        # Снимаем в finally стрима, а на ранних выходах — явно. Короткое
        # ожидание вместо мгновенного отказа: предыдущий ответ мог быть только
        # что остановлен и ещё досохраняется — на экране он уже завершён.
        if not acquire_generation_lock(user, wait_seconds=LOCK_WAIT_SECONDS):
            return Response(
                {
                    "code": "generation_in_progress",
                    "message": "Дождитесь окончания предыдущего ответа.",
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        # Флаг «стоп» от прошлого ответа не должен оборвать новый.
        clear_stop(user)

        try:
            # Лимиты проверяем ДО сохранения вопроса, чтобы не плодить сообщения
            # без ответа, и отвечаем обычным JSON до старта SSE — фронт увидит
            # non-200 и покажет апселл.
            try:
                decision = preflight(
                    user,
                    mode=conversation.mode,
                    scenario=scenario_id,
                    input_text=preflight_text,
                )
            except LimitExceeded as exc:
                release_generation_lock(user)
                # Упор в тариф — состояние диалога, а не разовая осечка: вопрос и
                # уведомление сохраняем, чтобы плашка осталась после ухода на
                # /billing и возврата. Разовые отказы показываем один раз.
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
                            "can_upgrade": effective_plan(user) != Plan.PRO,
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
            # Квота исчерпана, но grace-запросы остались: отвечаем на дешёвой
            # модели и подсвечиваем это плашкой на фронте.
            degraded = decision == "degrade"
            can_upgrade = effective_plan(user) != Plan.PRO

            # Вопрос сохраняем только после успешного preflight. При «повторить»
            # он уже в диалоге — второй раз не создаём.
            if not retry:
                _save_user_message(conversation, content, extracted)

            # Сценарий — свойство диалога, а не режима: вернувшись в чат (в т.ч.
            # с другого устройства), пользователь застаёт тот же пресет.
            if scenario_id and conversation.scenario_id != scenario_id:
                conversation.scenario_id = scenario_id
                conversation.save(update_fields=["scenario_id"])

            # Выбор провайдера, промпта и контекста — целиком в ai.service.
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
            """Генератор SSE: дельты ответа, затем сохранение и учёт расхода."""
            usage = ai.usage
            assistant_content = ""
            started = time.monotonic()
            client_gone = False  # соединение закрыто — отдавать события некуда
            stopped = False  # нажали «Стоп»: не ошибка, сохраняем написанное
            error_text = None  # текст ошибки для пользователя (уйдёт вместе с done)

            # Провайдера читает отдельный поток: пока он ждёт модель, этот цикл
            # успевает заметить «Стоп», таймаут и обрыв связи.
            inbox: queue.Queue = queue.Queue()
            cancel = threading.Event()
            reader = threading.Thread(
                target=_pump_deltas,
                args=(ai.deltas, inbox, cancel),
                daemon=True,
                name=f"llm-stream-{conversation.pk}",
            )
            reader.start()
            checked = 0.0  # когда последний раз смотрели «Стоп» и часы
            try:
                # Плашку деградации шлём до текста, чтобы фронт показал её сразу.
                if degraded:
                    yield _sse({"degraded": True, "can_upgrade": can_upgrade})
                while True:
                    # «Стоп» и потолок времени проверяем по часам, а не на каждой
                    # дельте: флаг живёт в Redis, а дельт бывают сотни в секунду.
                    # Проверка идёт по кругу цикла, а не только между дельтами, —
                    # иначе молчащий ответ не прерывался бы вовсе.
                    now_mono = time.monotonic()
                    if now_mono - checked >= CHECK_INTERVAL_SECONDS:
                        checked = now_mono
                        if stop_requested(user):
                            stopped = True
                            break
                        if now_mono - started > timeout_seconds:
                            error_text = "Превышено время ответа. Попробуйте снова."
                            break
                    try:
                        kind, payload = inbox.get(timeout=HEARTBEAT_SECONDS)
                    except queue.Empty:
                        yield ": ping\n\n"  # пульс: комментарий SSE, клиент его игнорирует
                        continue
                    if kind == "delta":
                        assistant_content += payload
                        yield _sse({"delta": payload})
                    elif kind == "error":
                        raise payload
                    else:  # провайдер дочитан
                        break
            except GeneratorExit:
                # Вкладка закрыта / сеть отвалилась: yield больше нельзя, но
                # сохранить ответ и снять лок обязаны.
                client_gone = True
            except Exception:  # noqa: BLE001 — стрим не должен падать молча
                # В лог — traceback, пользователю — нейтральный текст.
                logger.exception(
                    "Сбой генерации: conversation=%s mode=%s model=%s",
                    conversation.pk,
                    conversation.mode,
                    model,
                )
                error_text = "Не удалось дописать ответ. Попробуйте ещё раз."
            finally:
                # Поток чтения больше не нужен: он закроет поток провайдера сам.
                cancel.set()
                try:
                    message_id = None
                    if assistant_content:
                        msg = Message.objects.create(
                            conversation=conversation,
                            role=Message.Role.ASSISTANT,
                            content=assistant_content,
                            model=model,
                            # Плашки храним вместе с ответом, иначе при возврате
                            # в чат они пропадают.
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
                        # Пополнение глобальной памяти — в фоне, ответ не ждёт.
                        extract_facts_in_background(user, conversation)
                    elif not stopped and not error_text:
                        # Модель не отдала ни слова: честная ошибка вместо
                        # пустого пузырька — фронт предложит повторить.
                        logger.warning(
                            "Пустой ответ модели: conversation=%s mode=%s model=%s "
                            "usage=%s",
                            conversation.pk,
                            conversation.mode,
                            model,
                            usage,
                        )
                        error_text = "Модель не вернула ответ. Попробуйте ещё раз."
                    # Расход списываем всегда, а не только при сохранённом
                    # ответе: на прерванном и на пустом стриме провайдер уже
                    # потратил токены, и без записи они прошли бы мимо квоты.
                    # На обрыве usage прийти не успевает — выход оцениваем сами.
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
                    if not client_gone:
                        # Расход отдаём прямо здесь: он уже списан, и сайдбар
                        # обновляется в тот же момент, без гонки с опросом ЛК.
                        yield _sse(
                            {
                                "done": True,
                                "message_id": message_id,
                                "stopped": stopped,
                                "error": error_text,
                                "usage": mode_usage_report(user, conversation.mode),
                            }
                        )
                finally:
                    # Лок снимаем последним — после списания расхода, чтобы
                    # следующий запрос увидел уже обновлённые лимиты.
                    clear_stop(user)
                    release_generation_lock(user)

        response = StreamingHttpResponse(
            event_stream(), content_type="text/event-stream"
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class GenerationStopView(APIView):
    """POST /api/conversations/stop/ — остановить генерацию (кнопка «Стоп»).

    Ставит флаг; активный стрим увидит его на ближайшем круге (не дольше паузы
    между пульсами), сохранит написанное, спишет расход и снимет лок.
    Идемпотентен: флаг живёт до конца ответа.

    Отвечаем не сразу, а дождавшись конца ответа: пока лок держится, следующий
    вопрос получил бы 429 «дождитесь окончания» — притом что на экране ответ уже
    остановлен. `stopped: false` — не успели за отведённое время, фронт тогда
    рвёт соединение сам.
    """

    def post(self, request):
        """Попросить остановить текущий ответ и дождаться его завершения."""
        request_stop(request.user)
        finished = wait_generation_finished(request.user, STOP_WAIT_SECONDS)
        return Response({"stopped": finished}, status=status.HTTP_202_ACCEPTED)


def _sse(payload: dict) -> str:
    """Один кадр SSE: `data: {json}` с пустой строкой-разделителем."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
