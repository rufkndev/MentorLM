"""Закрыть текущий список «ждут чека НПД», ничего не ломая на будущее.

Зачем отдельная команда, когда в админке есть кнопка «выдать чек». Кнопка —
про рабочий случай: у платежа появилась ссылка на чек из «Мой налог», и она
уходит покупателю письмом (это и есть передача чека по ч. 1 ст. 14 ФЗ-422).
Здесь случай другой: чек по этим платежам выдавать не нужно или он уже
закрыт вне системы — тестовая оплата самому себе, возврат, чек, выписанный
до того, как реестр вообще появился. Отправлять за это письмо покупателю
нельзя: письмо с чеком, у которого нет чека, хуже молчания.

Поэтому команда делает ровно одно: проставляет `npd_receipt_at` у платежей,
которые сейчас числятся должниками, и гасит ключ «письмо уже отправляли»,
чтобы следующее напоминание не ждало таймаута. Логика напоминаний,
дедлайны, фильтр в админке и кнопка выдачи остаются как были — новый
оплаченный платёж снова попадёт в список и снова потребует чека.

    python manage.py npd_receipts_reset            # показать, что закроет
    python manage.py npd_receipts_reset --apply    # закрыть

`--url` записывает ссылку на уже выписанный чек, если она есть: тогда в
реестре останется не просто отметка, а сам документ.
"""

from __future__ import annotations

import logging

from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.billing.payments import payments_awaiting_npd_receipt

logger = logging.getLogger(__name__)

# Тот же ключ, что и в billing_tick: сброс состояния без него был бы неполным —
# список пуст, а следующее письмо всё равно молчало бы до конца таймаута.
_RECEIPTS_MAIL_KEY = "billing:npd-receipts-mail"


class Command(BaseCommand):
    help = "Отметить чеки НПД по текущим платежам выданными (без письма покупателю)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Выполнить; без флага команда только показывает список",
        )
        parser.add_argument(
            "--url",
            default="",
            help="Ссылка на уже выписанный чек, если она одна на все платежи",
        )

    def handle(self, *args, **options):
        pending = list(payments_awaiting_npd_receipt())
        if not pending:
            self.stdout.write(self.style.SUCCESS("Платежей, ждущих чека, нет"))
            cache.delete(_RECEIPTS_MAIL_KEY)
            return

        for payment in pending:
            deadline = payment.npd_deadline
            paid = f"{payment.paid_at:%d.%m.%Y}" if payment.paid_at else "—"
            due = f"{deadline:%d.%m.%Y}" if deadline else "—"
            self.stdout.write(
                f"  #{payment.pk}  {payment.amount} ₽  {payment.user_email}  "
                f"оплачен {paid}  срок {due}"
            )

        if not options["apply"]:
            self.stdout.write(
                self.style.WARNING(
                    f"Всего {len(pending)} — это предпросмотр. "
                    f"Повторите с --apply, чтобы закрыть их."
                )
            )
            return

        url = (options["url"] or "").strip()[:500]
        now = timezone.now()
        for payment in pending:
            payment.npd_receipt_at = now
            payment.npd_receipt_url = url
            payment.save(
                update_fields=["npd_receipt_at", "npd_receipt_url", "updated_at"]
            )

        cache.delete(_RECEIPTS_MAIL_KEY)
        logger.warning(
            "Список чеков НПД сброшен вручную: %s платеж(ей) отмечены выданными "
            "без отправки чека покупателю",
            len(pending),
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Закрыто {len(pending)} — писем покупателям не отправлено. "
                f"Напоминания продолжат работать для новых платежей."
            )
        )
