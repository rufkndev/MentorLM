"""Отправка писем — единственное место, откуда MentorLM пишет пользователю.

Транспорт — Yandex Cloud Postbox по SMTP (как настроить облако:
`dev_docs/notes/emailNote.md`). Для Django это обычный SMTP-бэкенд, поэтому
кода про облако здесь нет вовсе — только адрес и ключи из настроек. Сменить
провайдера = сменить четыре переменные окружения.

Два правила, из которых следует всё остальное в модуле:

* **Письмо не должно влиять на ответ пользователю.** Регистрация не обязана
  ждать SMTP, а SMTP имеет право отвалиться. Поэтому штатный способ отправки —
  `send_async`: демон-поток, который глушит любое исключение в лог. Упавшая
  почта не может уронить регистрацию.
* **Текст письма — шаблон, а не строка в коде.** Каждое письмо это пара
  `templates/emails/<name>.{txt,html}` плюс запись в `letters.LETTERS`.

Каждое письмо уходит в двух частях: текстовой и HTML. Текстовая — не
формальность: часть почтовых клиентов и антиспам-фильтров смотрят именно на
неё, а письмо совсем без text/plain выглядит для них подозрительно.
"""

from __future__ import annotations

import logging
import threading

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from .letters import LETTERS

logger = logging.getLogger(__name__)


def _base_context() -> dict:
    """Данные, которые нужны каждому письму: адрес сайта, поддержка, год."""
    return {
        "site_url": settings.PUBLIC_SITE_URL,
        "support_email": settings.SUPPORT_EMAIL,
        "year": timezone.now().year,
    }


def send(to_email: str, letter_name: str, context: dict | None = None) -> bool:
    """Отправить письмо синхронно. Вернуть True, если SMTP его принял.

    Исключения наружу не выпускает: у всех вызывающих реакция на «не отправилось»
    одинаковая — записать в лог и жить дальше.
    """
    letter = LETTERS.get(letter_name)
    if letter is None:
        # Опечатка в имени письма — ошибка программиста, но не повод 500 в
        # проде: пишем громко в лог и не отправляем ничего.
        logger.error("Неизвестное письмо %r — отправка отменена", letter_name)
        return False

    data = {**_base_context(), **(context or {})}
    try:
        message = EmailMultiAlternatives(
            subject=letter.subject,
            body=render_to_string(f"{letter.template}.txt", data),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[to_email],
            # На no-reply отвечать некуда, а отвечают всё равно — уводим ответы
            # в поддержку. Заодно это признак живого отправителя для фильтров.
            reply_to=[settings.SUPPORT_EMAIL],
        )
        message.attach_alternative(render_to_string(f"{letter.template}.html", data), "text/html")
        message.send(fail_silently=False)
    except Exception:  # noqa: BLE001 — почта не имеет права ронять запрос
        logger.exception("Не удалось отправить письмо %s на %s", letter_name, to_email)
        return False

    logger.info("Отправлено письмо %s на %s", letter_name, to_email)
    return True


def send_async(to_email: str, letter_name: str, context: dict | None = None) -> None:
    """Отправить письмо в фоновом потоке — штатный способ.

    ⚠️ `context` собирается вызывающим кодом ДО запуска потока и должен
    содержать только готовые значения (строки, числа). Передавать сюда модели
    нельзя: поток обращался бы к базе своим соединением, и его пришлось бы
    закрывать вручную, как в `apps.memory.services`. Здесь этого нет намеренно —
    поток не трогает БД вообще.
    """
    threading.Thread(
        target=send,
        args=(to_email, letter_name, context),
        daemon=True,
    ).start()
