"""Извлечение текста из прикреплённых файлов и политика их приёма.

Сами файлы не храним: из каждого достаём текст, кладём в БД и подмешиваем в
промпт. Белый список форматов узкий — pdf, docx, txt, md.
"""

from __future__ import annotations

import os

# Глобальные потолки-предохранители, едины для всех тарифов. Пер-тарифное число
# файлов — в billing.limits (max_attachments), проверяется во вьюхе.
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 МБ на файл
MAX_FILES_HARD = 10  # абсолютный потолок файлов на сообщение
MAX_TEXT_CHARS = 20_000  # потолок извлечённого текста на файл

# Белый список по расширению: только документы, из которых извлекаем текст.
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown"}
# Из этих текст достаём прямым декодированием.
_TEXT_EXTENSIONS = {".txt", ".md", ".markdown"}


def _ext(filename: str) -> str:
    """Расширение файла в нижнем регистре (с точкой)."""
    return os.path.splitext(filename or "")[1].lower()


def attachment_error(files, max_attachments: int):
    """Проверить политику вложений: (code, message, http_status) или None.

    Порядок — доступность фичи тарифу, число файлов, размер и формат каждого.
    Вызывается ДО извлечения текста и сохранения.
    """
    if not files:
        return None
    if max_attachments <= 0:
        return (
            "attachments_locked",
            "Вложения доступны на платных тарифах. Перейдите на Plus или Pro.",
            402,
        )
    limit = min(max_attachments, MAX_FILES_HARD)
    if len(files) > limit:
        return ("too_many_files", f"Не более {limit} файлов на сообщение.", 413)
    mb = MAX_FILE_SIZE // (1024 * 1024)
    for f in files:
        if f.size > MAX_FILE_SIZE:
            return ("file_too_large", f"Файл «{f.name}» больше {mb} МБ.", 413)
        if _ext(f.name) not in ALLOWED_EXTENSIONS:
            return (
                "unsupported_format",
                f"Формат файла «{f.name}» не поддерживается. "
                "Разрешены: PDF, DOCX, TXT, MD.",
                415,
            )
    return None


def _truncate(text: str) -> str:
    """Обрезать извлечённый текст до потолка, пометив факт обрезки."""
    text = text.strip()
    if len(text) <= MAX_TEXT_CHARS:
        return text
    return text[:MAX_TEXT_CHARS].rstrip() + "\n…[текст файла обрезан]"


def _from_text(data: bytes) -> str:
    """Декодировать текстовый файл; битые байты заменяем, а не падаем."""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("utf-8", errors="replace")


def _from_pdf(data: bytes) -> str:
    """Текст из PDF; pypdf импортируем лениво — без него вернём пометку."""
    try:
        from io import BytesIO

        from pypdf import PdfReader
    except Exception:  # pypdf не установлен
        return "[не удалось прочитать PDF: библиотека pypdf недоступна]"
    try:
        reader = PdfReader(BytesIO(data))
        pages = [(page.extract_text() or "") for page in reader.pages]
        return "\n\n".join(p for p in pages if p.strip())
    except Exception:
        return "[не удалось извлечь текст из PDF]"


def _from_docx(data: bytes) -> str:
    """Текст из DOCX; python-docx импортируем лениво, как и pypdf."""
    try:
        from io import BytesIO

        import docx  # python-docx
    except Exception:  # python-docx не установлен
        return "[не удалось прочитать DOCX: библиотека python-docx недоступна]"
    try:
        document = docx.Document(BytesIO(data))
        return "\n".join(p.text for p in document.paragraphs if p.text.strip())
    except Exception:
        return "[не удалось извлечь текст из DOCX]"


def extract_text(filename: str, data: bytes) -> str:
    """Извлечь текст по расширению файла, обрезав до лимита.

    Неподдержанный формат даёт короткую пометку — она тоже уйдёт в контекст,
    чтобы и модель, и пользователь знали, что файл не прочитан.
    """
    ext = _ext(filename)
    if ext == ".pdf":
        return _truncate(_from_pdf(data))
    if ext in (".docx",):
        return _truncate(_from_docx(data))
    if ext in _TEXT_EXTENSIONS:
        return _truncate(_from_text(data))
    return f"[формат файла {ext or '?'} не поддерживается для извлечения текста]"


def render_attachments_block(attachments) -> str:
    """Собрать текст вложений в блок для промпта; без текста — пустая строка."""
    parts = []
    for att in attachments:
        text = (att.extracted_text or "").strip()
        if not text:
            continue
        parts.append(f"### Файл: {att.filename}\n{text}")
    if not parts:
        return ""
    body = "\n\n".join(parts)
    return f"\n\n[Прикреплённые файлы]\n{body}"
