"""Извлечение текста из прикреплённых файлов для контекста модели.

Файлы не хранятся (медиа-хранилища в MVP нет) — из каждого достаём текст и
кладём в БД (Attachment.extracted_text), а затем подмешиваем в промпт. Поэтому
поддерживаем форматы, из которых можно получить осмысленный текст: pdf, docx,
txt/markdown/csv/код. Бинарные форматы (картинки и т.п.) не поддерживаем —
для них нужен мультимодальный путь, которого пока нет.

pypdf / python-docx импортируются лениво: без них pdf/docx просто не извлекутся
(вернётся понятная пометка), а текстовые файлы работают всегда.
"""

from __future__ import annotations

import os

# Ограничения (валидируются во вьюхе и/или здесь).
MAX_FILES = 5
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 МБ на файл
MAX_TEXT_CHARS = 20_000  # потолок извлечённого текста на файл (бюджет токенов)

# Расширения, из которых достаём текст напрямую (декодирование как utf-8).
_TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".yaml", ".yml",
    ".xml", ".html", ".htm", ".rtf", ".log", ".ini", ".env", ".toml",
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".h", ".cpp", ".hpp",
    ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".scala", ".sql",
    ".sh", ".bash", ".zsh", ".css", ".scss", ".vue", ".dart", ".r", ".m",
}


def _ext(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower()


def _truncate(text: str) -> str:
    """Обрезает извлечённый текст до потолка, помечая факт обрезки."""
    text = text.strip()
    if len(text) <= MAX_TEXT_CHARS:
        return text
    return text[:MAX_TEXT_CHARS].rstrip() + "\n…[текст файла обрезан]"


def _from_text(data: bytes) -> str:
    """Декодирует текстовый/кодовый файл (с запасным вариантом кодировки)."""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("utf-8", errors="replace")


def _from_pdf(data: bytes) -> str:
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
    """Достаёт текст из содержимого файла по его расширению.

    Возвращает извлечённый (и обрезанный до лимита) текст либо короткую пометку
    о том, что формат не поддержан — она тоже уйдёт в контекст, чтобы модель и
    пользователь понимали, что файл не прочитан.
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
    """Собирает извлечённый текст вложений в блок для промпта модели.

    `attachments` — итерируемое с полями filename и extracted_text. Пустой ввод
    даёт пустую строку (блок просто не добавится к сообщению).
    """
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
