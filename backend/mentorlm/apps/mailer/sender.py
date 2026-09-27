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

Каждая попытка оставляет строку в `SentLetter` — см. докстроку `models.py`:
коротко, без неё «уведомили за 24 часа» нечем подтвердить, потому что ошибку
SMTP этот модуль по построению глушит.
"""

from __future__ import annotations

import logging
import threading

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import connections, transaction
from django.template.loader import render_to_string
from django.utils import timezone

from .letters import LETTERS

logger = logging.getLogger(__name__)


def _log(to_email: str, letter_name: str, subject: str, error: str) -> None:
    """Записать попытку отправки. Свои ошибки гасит: журнал не важнее письма.

    Импорт модели здесь, а не наверху: `sender` вызывается в том числе из кода,
    который грузится раньше приложений, и тянуть за собой модели он не должен.
    """
    try:
        from .models import SentLetter

        # Своя точка сохранения: `send` вызывают и изнутри транзакции (вебхук,
        # выдача чека), а упавший INSERT без savepoint ломает её целиком — то
        # есть почта уронила бы операцию, которой сопровождала письмо.
        with transaction.atomic():
            SentLetter.objects.create(
                to_email=to_email,
                letter=letter_name,
                subject=subject,
                status=SentLetter.Status.FAILED if error else SentLetter.Status.SENT,
                # Трейсбек целиком уже в логах — здесь нужна причина, а не простыня.
                error=error[:2000],
            )
    except Exception:  # noqa: BLE001 — не отправили ИЛИ не записали: разные беды
        logger.exception("Не удалось записать в журнал письмо %s на %s", letter_name, to_email)


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
        _log(to_email, letter_name, "", f"Неизвестное письмо {letter_name!r}")
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
    except Exception as exc:  # noqa: BLE001 — почта не имеет права ронять запрос
        logger.exception("Не удалось отправить письмо %s на %s", letter_name, to_email)
        _log(to_email, letter_name, letter.subject, f"{type(exc).__name__}: {exc}")
        return False

    logger.info("Отправлено письмо %s на %s", letter_name, to_email)
    _log(to_email, letter_name, letter.subject, "")
    return True


def _send_and_close(to_email: str, letter_name: str, context: dict | None) -> None:
    """Тело фонового потока: отправить и закрыть соединение с БД за собой.

    Соединение появляется из-за записи в журнал. Поток свой — значит и пул
    соединений у него свой, и никто, кроме него, его не закроет: без этого
    каждое письмо оставляло бы висеть коннект к Postgres.
    """
    try:
        send(to_email, letter_name, context)
    finally:
        connections.close_all()


def send_async(to_email: str, letter_name: str, context: dict | None = None) -> None:
    """Отправить письмо в фоновом потоке — штатный способ.

    ⚠️ `context` собирается вызывающим кодом ДО запуска потока и должен
    содержать только готовые значения (строки, числа). Передавать сюда модели
    нельзя: ленивое обращение к связанному объекту ушло бы в базу уже из потока,
    в непредсказуемый момент и своим соединением.
    """
    threading.Thread(
        target=_send_and_close,
        args=(to_email, letter_name, context),
        daemon=True,
    ).start()
