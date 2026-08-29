"""Периодический такт биллинга: уведомить, списать, добить зависшее.

Запускается сервисом `scheduler` из docker-compose раз в 10 минут. Одна команда
вместо трёх намеренно: шаги идут строго по порядку (сначала уведомить, потом
списывать), и разнести их по разным расписаниям — значит однажды получить
списание раньше уведомления.

Вся команда идемпотентна: повторный запуск на тех же данных ничего не
продублирует. Это не «хорошо бы», а условие работоспособности — контейнер
может перезапуститься в любой момент, в том числе посреди прохода.

Каждый шаг обёрнут так, что падение на одном пользователе не роняет проход:
одна просроченная карта не должна лишать уведомления всех остальных.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.db import connection
from django.utils import timezone

from apps.billing.limits import (
    NPD_RECEIPT_WARN_DAYS,
    RENEWAL_NOTICE_HOURS,
    limits_for,
    plan_price,
)
from apps.billing.models import BillingEvent, Payment, Subscription, log_event
from apps.billing.payments import (
    PaymentError,
    billing_url,
    charge_renewal,
    format_date,
    manage_url,
    payments_awaiting_npd_receipt,
    refund_for_missing_notice,
    renewal_blocked_reason,
    sync_payment,
)
from apps.billing.plans import PAST_DUE_GRACE
from apps.mailer.sender import send

logger = logging.getLogger(__name__)

# Произвольное, но постоянное число: ключ advisory-лока Postgres. Смысл только
# в том, чтобы два такта не пересеклись — а они пересекутся, если проход
# затянется дольше периода запуска.
_LOCK_KEY = 8_150_423

# Окно рассылки уведомлений. Шире, чем ровно 24 часа, потому что такт идёт раз
# в 10 минут и точного попадания в момент не бывает; нижняя граница с запасом
# больше 24 ч, чтобы уведомление гарантированно опережало списание.
_NOTICE_WINDOW_START = timedelta(hours=RENEWAL_NOTICE_HOURS + 1)
_NOTICE_WINDOW_END = timedelta(hours=RENEWAL_NOTICE_HOURS + 4)

# Платежи ЮKassa живут около часа; всё, что старше и не завершилось, надо
# добить запросом статуса, иначе строка навсегда останется в pending.
_STALE_PAYMENT_AGE = timedelta(hours=1)

# Ключ и срок «письмо про чеки уже отправляли». Живёт в общем кэше (Redis),
# поэтому переживает перезапуск контейнера — иначе рестарт сбрасывал бы
# ограничение и письма шли бы пачками.
_RECEIPTS_MAIL_KEY = "billing:npd-receipts-mail"
_RECEIPTS_MAIL_TTL = 60 * 60 * 20  # 20 ч: чуть меньше суток, чтобы не «уползать»


@contextmanager
def _advisory_lock():
    """Взять межпроцессный лок Postgres на время прохода.

    `pg_try_advisory_lock` не ждёт: если такт уже идёт, этот просто пропускаем.
    Ждать было бы хуже — очередь тактов накопилась бы и они пошли бы подряд.
    """
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(%s)", [_LOCK_KEY])
        acquired = cursor.fetchone()[0]
    try:
        yield acquired
    finally:
        if acquired:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", [_LOCK_KEY])


class Command(BaseCommand):
    help = "Такт биллинга: уведомления о списании, автопродление, синхронизация платежей"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Показать, что было бы сделано, ничего не меняя",
        )

    def handle(self, *args, **options):
        dry = options["dry_run"]
        with _advisory_lock() as acquired:
            if not acquired:
                self.stdout.write("Такт уже выполняется — пропускаем")
                return

            notified = self._notify_upcoming(dry)
            expiring = self._notify_expiring(dry)
            charged, failed = self._charge_due(dry)
            synced = self._sync_stale(dry)
            refunded = self._refund_unlawful(dry)
            pending_receipts = self._check_npd_receipts()

        self.stdout.write(
            self.style.SUCCESS(
                f"Такт биллинга{' (dry-run)' if dry else ''}: "
                f"уведомлений {notified}, писем об окончании {expiring}, "
                f"списаний {charged}, неудач {failed}, "
                f"синхронизаций {synced}, возвратов {refunded}"
            )
        )
        if pending_receipts:
            self.stdout.write(
                self.style.WARNING(f"Ждут чека НПД: {pending_receipts}")
            )

    # ── Шаг 1: уведомления за 24 часа ────────────────────────────────────────

    def _notify_upcoming(self, dry: bool) -> int:
        """Разослать письма о предстоящих списаниях (п. 7.3 оферты).

        Без этого шага следующий не сработает вовсе: `renewal_blocked_reason`
        не пропустит списание без отметки об отправленном уведомлении.
        """
        now = timezone.now()
        due = Subscription.objects.filter(
            auto_renew=True,
            canceled_at__isnull=True,
            renewal_notified_at__isnull=True,
            status=Subscription.Status.ACTIVE,
            current_period_end__gte=now + _NOTICE_WINDOW_START,
            current_period_end__lte=now + _NOTICE_WINDOW_END,
        ).exclude(payment_method_id="").select_related("user")

        sent = 0
        for sub in due:
            if sub.user is None:
                continue
            if dry:
                self.stdout.write(f"[dry] уведомил бы {sub.user.email} о {sub.current_period_end}")
                sent += 1
                continue

            charge_date = format_date(sub.current_period_end)
            context = {
                "plan_label": limits_for(sub.plan)["label"],
                "amount": plan_price(sub.plan),
                "charge_date": charge_date,
                "period_end": charge_date,
                "card_title": sub.card_title,
                "manage_url": manage_url(),
            }
            # Синхронно, в отличие от остального проекта: отметку
            # renewal_notified_at можно ставить только если письмо реально
            # ушло. Поставить её «на всякий случай» — значит разрешить
            # списание без уведомления, а это полный возврат по п. 7.6.
            if not send(sub.user.email, "renewal_notice", context):
                logger.error(
                    "Не отправлено уведомление о списании для %s — списания не будет",
                    sub.user.email,
                )
                continue

            sub.renewal_notified_at = timezone.now()
            sub.save(update_fields=["renewal_notified_at", "updated_at"])
            log_event(
                kind=BillingEvent.Kind.RENEWAL_NOTIFIED,
                user=sub.user,
                subscription=sub,
                note=f"{plan_price(sub.plan)} ₽, списание {charge_date}",
            )
            sent += 1
        return sent

    # ── Шаг 1б: подписки, которые просто закончатся ──────────────────────────

    def _notify_expiring(self, dry: bool) -> int:
        """Предупредить тех, у кого автосписания не будет.

        Ровно дополнение к шагу 1: там — «завтра спишем», здесь — «завтра
        закончится, спишем ничего». Вместе они покрывают все активные подписки,
        и человек ни при каком раскладе не узнаёт об окончании доступа задним
        числом.

        Отдельный смысл у случая `auto_renew_requested and not auto_renew`:
        человек ПРОСИЛ автопродление, но привязать платёжное средство не
        удалось (у нас автосписания работают только с банковской карты). Такой
        подписке письмо нужно больше всех — ожидания у человека ровно
        противоположные тому, что произойдёт.
        """
        now = timezone.now()
        due = Subscription.objects.filter(
            auto_renew=False,
            expiry_notified_at__isnull=True,
            status=Subscription.Status.ACTIVE,
            current_period_end__gte=now + _NOTICE_WINDOW_START,
            current_period_end__lte=now + _NOTICE_WINDOW_END,
        ).select_related("user")

        sent = 0
        for sub in due:
            if sub.user is None:
                continue
            binding_failed = sub.auto_renew_requested and not sub.payment_method_id
            if dry:
                self.stdout.write(
                    f"[dry] предупредил бы {sub.user.email} об окончании "
                    f"{sub.current_period_end}"
                    f"{' (привязка не удалась)' if binding_failed else ''}"
                )
                sent += 1
                continue

            context = {
                "plan_label": limits_for(sub.plan)["label"],
                "amount": plan_price(sub.plan),
                "period_end": format_date(sub.current_period_end),
                "billing_url": billing_url(),
                # Различает два текста письма: «вы отключили» и «привязать не
                # получилось». Спутать их — значит обвинить человека в том,
                # чего он не делал.
                "binding_failed": binding_failed,
            }
            # Синхронно и с отметкой только по факту отправки — по той же
            # причине, что и в шаге 1: отметка «уведомили» без письма хуже, чем
            # её отсутствие, потому что второй попытки уже не будет.
            if not send(sub.user.email, "subscription_expiring", context):
                logger.error(
                    "Не отправлено письмо об окончании подписки для %s",
                    sub.user.email,
                )
                continue

            sub.expiry_notified_at = timezone.now()
            sub.save(update_fields=["expiry_notified_at", "updated_at"])
            sent += 1
        return sent

    # ── Шаг 2: списания ──────────────────────────────────────────────────────

    def _charge_due(self, dry: bool) -> tuple[int, int]:
        """Списать оплату с тех, у кого период истёк и уведомление отправлено."""
        now = timezone.now()
        due = Subscription.objects.filter(
            auto_renew=True,
            canceled_at__isnull=True,
            current_period_end__lte=now,
            status__in=(Subscription.Status.ACTIVE, Subscription.Status.PAST_DUE),
        ).exclude(payment_method_id="").select_related("user")

        charged = failed = 0
        for sub in due:
            blocked = renewal_blocked_reason(sub)
            if blocked:
                # Штатная ситуация, а не ошибка: чаще всего человек отказался
                # или уведомление ещё не ушло. Пишем в лог, чтобы причина
                # «почему не списали» всегда была видна.
                logger.info("Подписка %s: списание пропущено — %s", sub.pk, blocked)
                continue

            if dry:
                self.stdout.write(f"[dry] списал бы {plan_price(sub.plan)} ₽ с {sub.user}")
                charged += 1
                continue

            try:
                payment = charge_renewal(sub)
            except PaymentError as exc:
                logger.warning("Подписка %s: списание не прошло — %s", sub.pk, exc)
                failed += 1
                continue

            if payment.status == Payment.Status.SUCCEEDED:
                charged += 1
            elif payment.status == Payment.Status.CANCELED:
                failed += 1
            # pending / waiting_for_capture — платёж в пути, ни успех, ни
            # неудача. Его добьёт шаг 3, а до тех пор подписку от повторного
            # списания бережёт renewal_blocked_reason.
        return charged, failed

    # ── Шаг 3: зависшие платежи ──────────────────────────────────────────────

    def _sync_stale(self, dry: bool) -> int:
        """Дотянуть статус платежей, о которых не пришло уведомление.

        Вебхук может не дойти — сеть, перезапуск, ошибка на нашей стороне.
        Без этого шага человек оплатил бы, а тариф остался бы невключённым.
        """
        cutoff = timezone.now() - _STALE_PAYMENT_AGE
        stale = Payment.objects.filter(
            status__in=(Payment.Status.PENDING, Payment.Status.WAITING_FOR_CAPTURE),
            created_at__lte=cutoff,
        ).exclude(external_id__isnull=True)[:200]

        synced = 0
        for payment in stale:
            if dry:
                self.stdout.write(f"[dry] синхронизировал бы платёж {payment.pk}")
                synced += 1
                continue
            sync_payment(payment)
            synced += 1
        return synced

    # ── Шаг 5: напоминание о чеках НПД ───────────────────────────────────────

    def _check_npd_receipts(self) -> int:
        """Напомнить о невыданных чеках: письмом владельцу и записью в лог.

        Выдать чек за нас планировщик не может — у «Мой налог» нет открытого
        API. Единственное, что здесь возможно и что реально помогает, — не дать
        сроку из ФЗ-422 пройти незамеченным.

        Письмо, а не только лог: срок из закона — это дата, за которой должен
        следить человек. Читать `docker logs` ежедневно никто не будет, а
        пропущенный чек — штраф. Отправка не чаще раза в сутки: такт идёт раз в
        десять минут, и без ограничения это был бы спам на 144 письма в день.
        """
        pending = list(payments_awaiting_npd_receipt()[:200])
        if not pending:
            return 0

        now = timezone.now()
        soon = overdue = 0
        nearest = None
        total_amount = Decimal("0")
        for payment in pending:
            total_amount += payment.amount
            deadline = payment.npd_deadline
            if deadline is None:
                continue
            if nearest is None or deadline < nearest:
                nearest = deadline
            if deadline < now:
                overdue += 1
            elif deadline - now <= timedelta(days=NPD_RECEIPT_WARN_DAYS):
                soon += 1

        if overdue:
            logger.error(
                "ПРОСРОЧЕНЫ чеки НПД: %s шт. — нарушение ч. 3 ст. 14 ФЗ-422. "
                "Выдать в «Мой налог» и отметить в админке (Платежи → Чек НПД).",
                overdue,
            )
        elif soon:
            logger.warning("Скоро истекает срок выдачи чеков НПД: %s шт.", soon)

        # Пишем, только когда есть о чём: срок близко или уже прошёл. Просто
        # «есть невыданные чеки» — не новость, месяц на них ещё есть.
        if (overdue or soon) and cache.add(_RECEIPTS_MAIL_KEY, 1, timeout=_RECEIPTS_MAIL_TTL):
            send(
                settings.SUPPORT_EMAIL,
                "npd_receipts_due",
                {
                    "total": len(pending),
                    "overdue": overdue,
                    "nearest_deadline": format_date(nearest),
                    "total_amount": int(total_amount),
                    "admin_url": f"{settings.PUBLIC_SITE_URL}/admin/billing/payment/?npd=pending",
                },
            )
        return len(pending)

    # ── Шаг 4: возвраты по п. 7.6 ────────────────────────────────────────────

    def _refund_unlawful(self, dry: bool) -> int:
        """Вернуть деньги, списанные без надлежащего уведомления.

        Проверка «после факта» — вторая линия обороны: `charge_renewal` такого
        списания не допускает конструктивно. Но если оно всё же произошло
        (ручной вызов, ошибка в коде, платёж из кабинета), оферта не оставляет
        выбора — п. 7.6 требует вернуть всю сумму, и лучше это сделать самим,
        чем по требованию.
        """
        cutoff = timezone.now() - PAST_DUE_GRACE
        suspicious = (
            Payment.objects.filter(
                kind=Payment.Kind.RENEWAL,
                status=Payment.Status.SUCCEEDED,
                refunded_amount=0,
                paid_at__gte=cutoff,
            )
            .select_related("subscription")
            .exclude(subscription__isnull=True)
        )

        refunded = 0
        for payment in suspicious:
            sub = payment.subscription
            # Признак нарушения: на момент списания человек уже отказался.
            unlawful = bool(sub.canceled_at and payment.paid_at and sub.canceled_at < payment.paid_at)
            if not unlawful:
                continue
            if dry:
                self.stdout.write(f"[dry] вернул бы {payment.amount} ₽ по платежу {payment.pk}")
                refunded += 1
                continue
            try:
                from apps.billing.models import Refund

                refund_for_missing_notice(payment, reason=Refund.Reason.AFTER_CANCEL)
                refunded += 1
            except PaymentError as exc:
                logger.error("Не удалось вернуть платёж %s: %s", payment.pk, exc)
        return refunded
