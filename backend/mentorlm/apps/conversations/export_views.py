"""Выгрузка ответа ИИ файлом: .docx по ГОСТ, .md как есть или список
литературы по ГОСТ Р 7.0.5-2008 (для ответов с источниками).

Вынесено из views.py: тот целиком про стриминг и уже большой, а сюда тянется
python-docx — незачем держать его в модуле горячего пути.

⚠️ Отдаём обычный HttpResponse, а не DRF Response. Рендереры DRF применяются
только к Response, поэтому бинарь проходит насквозь — тот же приём, которым в
views.py отдаётся SSE. Но согласование содержимого у DRF идёт в `initial()`, ДО
обработчика: если клиент пришлёт Accept с docx-типом, он получит 406 и до кода
ниже дело не дойдёт. Поэтому фронтовый download() не ставит Accept — ровно по
той же причине, по которой его не ставит стример.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import quote
from uuid import uuid4

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import HttpResponse

from .models import Message

logger = logging.getLogger(__name__)

# Потолок на вход конвертера. MAX_MESSAGE_CHARS (400k) — про сообщение
# пользователя; ответы модели короче на порядок, а сборка .docx синхронна и
# занимает поток gthread-воркера, в котором иначе шёл бы SSE.
MAX_EXPORT_CHARS = 200_000

DOCX_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)

# Символы, недопустимые в имени файла на Windows и macOS.
_BAD_FILENAME_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')

FORMATS = {
    "docx": DOCX_TYPE,
    "md": "text/markdown; charset=utf-8",
    # Список литературы по ГОСТ — только для ответов с источниками.
    "sources": DOCX_TYPE,
}


def _safe_filename(title: str, ext: str) -> str:
    """Имя файла из названия диалога: без служебных символов и не длиннее 80."""
    name = _BAD_FILENAME_CHARS.sub("", title or "").strip()
    name = re.sub(r"\s+", " ", name)[:80].strip(" .")
    return f"{name or 'Ответ MentorLM'}.{ext}"


def _build_sources(sources: list, accessed_at: str | None) -> bytes:
    """Список литературы: дату обращения переводим в вид ДД.ММ.ГГГГ."""
    from datetime import date

    from .export import build_sources_docx

    try:
        day = date.fromisoformat(accessed_at or "")
    except ValueError:
        # У ответов, сохранённых до появления этого поля, даты нет. Точнее
        # всего был бы день создания сообщения, но и сегодняшняя дата лучше
        # пустой скобки в записи.
        day = date.today()
    return build_sources_docx(sources, day.strftime("%d.%m.%Y")).getvalue()


def _disposition(name: str) -> str:
    """Content-Disposition с ASCII-именем и кириллическим по RFC 5987.

    filename= обязан быть ASCII — туда кладём заглушку; настоящее имя идёт в
    filename*. Порядок важен: по RFC 6266 клиент, понимающий filename*, обязан
    предпочесть его.
    """
    ascii_name = f"mentorlm-{uuid4().hex[:8]}.{name.rsplit('.', 1)[-1]}"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"


class MessageExportView(APIView):
    """GET /api/conversations/{pk}/messages/{mid}/export/{fmt}/ — ответ файлом."""

    throttle_scope = "export"

    def get(self, request, pk: int, mid: int, fmt: str):
        if fmt not in FORMATS:
            return Response(
                {"code": "bad_format", "message": "Неизвестный формат выгрузки."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Чужой диалог даёт 404, а не 403: сам факт существования id — тоже
        # сведения. Выгружаем только ответы модели: вопрос у пользователя и так
        # есть, а уведомления о лимитах документом не являются.
        message = (
            Message.objects.filter(
                pk=mid,
                conversation__pk=pk,
                conversation__user=request.user,
                role=Message.Role.ASSISTANT,
                kind=Message.Kind.TEXT,
            )
            .select_related("conversation")
            .first()
        )
        if message is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        if len(message.content) > MAX_EXPORT_CHARS:
            return Response(
                {
                    "code": "too_large",
                    "message": "Ответ слишком большой для выгрузки.",
                },
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        title = message.conversation.title or ""
        ext = "md" if fmt == "md" else "docx"
        name = title if fmt != "sources" else f"{title} — список литературы"
        filename = _safe_filename(name, ext)

        if fmt == "sources":
            sources = message.meta.get("sources") or []
            if not sources:
                return Response(
                    {
                        "code": "no_sources",
                        "message": "У этого ответа нет источников.",
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
            payload = _build_sources(sources, message.meta.get("accessed_at"))
        elif fmt == "md":
            payload = message.content.encode("utf-8")
        else:
            try:
                from .export import build_docx

                payload = build_docx([(title, message.content)]).getvalue()
            except Exception:
                # Почти всегда это экзотический Markdown, а не поломка сервиса,
                # поэтому 422 и понятный текст, а не 500 в общий шум.
                logger.exception("Не удалось собрать .docx: message=%s", message.pk)
                return Response(
                    {
                        "code": "export_failed",
                        "message": "Не удалось собрать документ.",
                    },
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

        response = HttpResponse(payload, content_type=FORMATS[fmt])
        response["Content-Disposition"] = _disposition(filename)
        response["Content-Length"] = str(len(payload))
        return response
