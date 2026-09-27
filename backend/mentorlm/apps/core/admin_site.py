"""Админка MentorLM: своя `AdminSite` ради сводки на главной.

Главная страница стандартной админки — список приложений, и ничего больше. Для
одного администратора это означает обход десяти разделов, чтобы узнать, всё ли в
порядке; а часть вопросов имеет срок (чек НПД по ФЗ-422) и о них надо узнавать
без обхода. Поэтому на индексе появился блок «Требует внимания» и несколько
цифр, а список приложений остался ниже.

Правило для блока: строка в «Требует внимания» появляется ТОЛЬКО когда нужно
что-то сделать руками, и каждая ведёт в отфильтрованный список, где это делается.
Постоянно висящая строка перестаёт читаться, поэтому «всё в порядке» — это пустой
блок, а не список зелёных галочек.

Все запросы здесь — агрегаты, и их ровно столько, сколько плиток: индекс
админки не имеет права стать самой тяжёлой страницей проекта.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib import admin
from django.db.models import Count, Sum
from django.urls import reverse
from django.utils import timezone

# $1 = 1_000_000 µ$ — в микродолларах хранится стоимость запросов (usage).
_MICRO = Decimal("1000000")


def _alerts(now) -> list[dict]:
    """Список того, что ждёт ручного действия. Пустой список — это норма."""
    from apps.billing.models import Payment, Refund, Subscription
    from apps.billing.payments import payments_awaiting_npd_receipt
    from apps.mailer.models import SentLetter

    alerts: list[dict] = []

    # 1. Чеки НПД. Единственный пункт со сроком, установленным законом, поэтому
    # первый. Срок считается по `paid_at` в Python (9-е число следующего месяца
    # не выражается фильтром), но перебираем только невыданные — их единицы.
    overdue = soon = 0
    for payment in payments_awaiting_npd_receipt()[:200]:
        deadline = payment.npd_deadline
        if deadline is None:
            continue
        if deadline < now:
            overdue += 1
        elif deadline - now <= timedelta(days=7):
            soon += 1
    receipts_url = reverse("admin:billing_payment_changelist") + "?npd=pending"
    if overdue:
        alerts.append(
            {
                "level": "error",
                "text": f"Просрочены чеки НПД: {overdue} — нарушение ч. 3 ст. 14 ФЗ-422",
                "url": receipts_url,
            }
        )
    if soon:
        alerts.append(
            {
                "level": "warn",
                "text": f"Чеки НПД со сроком в пределах недели: {soon}",
                "url": receipts_url,
            }
        )

    # 2. Просил автопродление, а привязки нет. Инвариант из billing.payments:
    # `auto_renew` без `payment_method_id` невозможен, поэтому расхождение с
    # `auto_renew_requested` и есть «человек ждёт продления, которого не будет».
    # Он об этом не знает, пока не кончится подписка, — поэтому это алерт.
    unbound = (
        Subscription.objects.filter(auto_renew_requested=True, auto_renew=False)
        .filter(status=Subscription.Status.ACTIVE)
        .count()
    )
    if unbound:
        alerts.append(
            {
                "level": "warn",
                "text": f"Автопродление просили, средство не привязано: {unbound}",
                "url": reverse("admin:billing_subscription_changelist")
                + "?auto_renew__exact=0&auto_renew_requested__exact=1&status__exact=active",
            }
        )

    # 3. Не смогли списать. Грейс три дня (plans.PAST_DUE_GRACE), после него
    # человек теряет тариф молча — успеть написать ему можно только здесь.
    past_due = Subscription.objects.filter(status=Subscription.Status.PAST_DUE).count()
    if past_due:
        alerts.append(
            {
                "level": "warn",
                "text": f"Подписки с непрошедшим списанием: {past_due}",
                "url": reverse("admin:billing_subscription_changelist")
                + "?status__exact=past_due",
            }
        )

    # 4. Возвраты, зависшие в обработке у ЮKassa: деньги не вернулись, а мы
    # считаем вопрос закрытым.
    stuck = Refund.objects.filter(
        status=Refund.Status.PENDING, created_at__lt=now - timedelta(hours=24)
    ).count()
    if stuck:
        alerts.append(
            {
                "level": "warn",
                "text": f"Возвраты в обработке больше суток: {stuck}",
                "url": reverse("admin:billing_refund_changelist") + "?status__exact=pending",
            }
        )

    # 5. Письма, которые не ушли. Среди них может быть уведомление о списании —
    # а это прямой путь к полному возврату по п. 7.6 оферты.
    failed_mail = SentLetter.objects.filter(
        status=SentLetter.Status.FAILED, created_at__gte=now - timedelta(days=1)
    ).count()
    if failed_mail:
        alerts.append(
            {
                "level": "error",
                "text": f"Письма не отправлены за сутки: {failed_mail}",
                "url": reverse("admin:mailer_sentletter_changelist") + "?status__exact=failed",
            }
        )

    # 6. Платежи, застрявшие в ожидании подтверждения: деньги у банка
    # заблокированы, а услуга не включена.
    hanging = Payment.objects.filter(
        status=Payment.Status.WAITING_FOR_CAPTURE, created_at__lt=now - timedelta(hours=1)
    ).count()
    if hanging:
        alerts.append(
            {
                "level": "warn",
                "text": f"Платежи ждут подтверждения больше часа: {hanging}",
                "url": reverse("admin:billing_payment_changelist")
                + "?status__exact=waiting_for_capture",
            }
        )

    return alerts


def _tiles(now) -> list[dict]:
    """Шесть цифр, по которым видно состояние дела: люди, деньги, расход."""
    from apps.billing.limits import limits_for
    from apps.billing.models import Payment
    from apps.billing.plans import alive_subscriptions
    from apps.usage.models import UsageEvent
    from apps.users.models import UserProfile

    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    # Подписки: считаем тем же определением «живая», что и тариф пользователя.
    by_plan = (
        alive_subscriptions(now)
        .values("plan")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    plans = {row["plan"]: row["count"] for row in by_plan}
    subs_hint = ", ".join(f"{limits_for(p)['label']}: {n}" for p, n in plans.items()) or "нет"

    # Деньги: платежи, оплаченные за 30 дней, минус возвращённое по ним. Возврат
    # по старому платежу в эту цифру не попадёт — она про период, а не про
    # кассу; для сверки с кассой есть реестр.
    money = Payment.objects.filter(
        status=Payment.Status.SUCCEEDED, paid_at__gte=month_ago
    ).aggregate(gross=Sum("amount"), refunded=Sum("refunded_amount"))
    gross = money["gross"] or Decimal("0")
    refunded = money["refunded"] or Decimal("0")

    # Расход на модели: billable_tokens — это µ$ (историческое имя поля).
    spend = UsageEvent.objects.filter(created_at__gte=month_ago).aggregate(s=Sum("billable_tokens"))
    spend_usd = (Decimal(spend["s"] or 0) / _MICRO).quantize(Decimal("0.01"))

    users_total = UserProfile.objects.count()
    verified = UserProfile.objects.filter(email_verified=True).count()
    new_users = UserProfile.objects.filter(created_at__gte=week_ago).count()

    requests_day = UsageEvent.objects.filter(created_at__gte=day_ago).count()
    requests_month = UsageEvent.objects.filter(created_at__gte=month_ago).count()

    return [
        {
            "label": "Действующих подписок",
            "value": sum(plans.values()),
            "hint": subs_hint,
            "url": reverse("admin:billing_subscription_changelist"),
        },
        {
            "label": "Выручка за 30 дней",
            "value": f"{gross - refunded:,.0f} ₽".replace(",", " "),
            "hint": f"возвращено {refunded:,.0f} ₽".replace(",", " "),
            "url": reverse("admin:billing_payment_changelist") + "?status__exact=succeeded",
        },
        {
            # Рядом с выручкой намеренно: это себестоимость того же периода, и
            # единственная пара цифр, из которой видно, сходится ли экономика.
            "label": "Расход на модели за 30 дней",
            "value": f"${spend_usd}",
            "hint": f"{requests_month} запросов",
            "url": reverse("admin:usage_usageevent_changelist"),
        },
        {
            "label": "Запросов к ИИ за сутки",
            "value": requests_day,
            "hint": "по журналу расхода",
            "url": reverse("admin:usage_usageevent_changelist"),
        },
        {
            "label": "Новых пользователей за 7 дней",
            "value": new_users,
            "hint": f"всего {users_total}",
            "url": reverse("admin:users_userprofile_changelist"),
        },
        {
            "label": "Подтвердили почту",
            "value": f"{round(verified / users_total * 100) if users_total else 0}%",
            # Неподтверждённая почта у платящего — это недоставленный чек и
            # недоставленное уведомление о списании, то есть наш риск.
            "hint": f"{verified} из {users_total}; оплата требует подтверждения",
            "url": reverse("admin:users_userprofile_changelist") + "?email_verified__exact=0",
        },
    ]


class MentorLMAdminSite(admin.AdminSite):
    """Админка проекта: то же, что стандартная, плюс сводка на индексе."""

    site_header = "MentorLM"
    site_title = "MentorLM"
    index_title = "Сводка"
    index_template = "admin/mentorlm_index.html"

    def index(self, request, extra_context=None):
        now = timezone.now()
        context = {
            **(extra_context or {}),
            "summary_alerts": _alerts(now),
            "summary_tiles": _tiles(now),
        }
        return super().index(request, context)
