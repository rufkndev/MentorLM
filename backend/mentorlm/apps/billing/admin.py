"""Админка биллинга: подписки, реестр платежей, возвраты и журнал согласий.

Здесь же живёт единственный интерфейс возврата денег. Оферта (п. 11.5) говорит,
что требование о возврате приходит на почту, а не кнопкой в ЛК, — поэтому
самообслуживания у пользователя нет, а у нас есть действие, которое считает
сумму по формуле из п. 11.2 и проводит возврат через ЮKassa.

Реестр платежей открыт только на чтение. Не из осторожности: `Payment` — это
след денежной операции, и «поправить» его в админке нельзя примерно по той же
причине, по какой нельзя подтереть строку в кассовой книге. Всё, что можно
сделать с платежом, делается действием, которое оставляет свой след.
"""

from decimal import Decimal, InvalidOperation

from django.contrib import admin, messages
from django.shortcuts import redirect, render
from django.urls import path, reverse
from django.utils.html import format_html

from django.utils import timezone

from .limits import USE_KKT_RECEIPTS, limits_for
from .models import BillingEvent, Payment, Refund, Subscription
from .payments import (
    PaymentError,
    cancel_autorenew,
    issue_npd_receipt,
    period_spend_rub,
    refund_payment,
    suggest_refund_amount,
)
from .plans import active_subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    """Список подписок с признаком реально действующей."""

    list_display = (
        "user",
        "plan",
        "status",
        "auto_renew",
        "card",
        "current_period_end",
        "renewal_notified_at",
        "is_alive",
        "created_at",
    )
    list_filter = ("plan", "status", "provider", "auto_renew")
    search_fields = ("user__email", "external_id", "payment_method_id")
    readonly_fields = (
        "auto_renew_consent_at",
        "auto_renew_consent_ip",
        "payment_method_id",
        "renewal_notified_at",
        "renewal_attempts",
        "canceled_at",
        "offer_version",
        "created_at",
        "updated_at",
    )
    actions = ("disable_autorenew",)

    @admin.display(boolean=True, description="Действует сейчас")
    def is_alive(self, obj) -> bool:
        """Даёт ли именно эта подписка тариф прямо сейчас (статус + срок)."""
        alive = active_subscription(obj.user)
        return alive is not None and alive.pk == obj.pk

    @admin.display(description="Карта")
    def card(self, obj) -> str:
        return obj.card_title or "—"

    @admin.action(description="Отключить автопродление")
    def disable_autorenew(self, request, queryset):
        """Отказ от имени пользователя — когда он написал на почту.

        По п. 7.4 оферты отказ можно заявить и письмом, а не только в ЛК.
        Проходит через тот же `cancel_autorenew`, что и кнопка в кабинете:
        письмо-подтверждение и запись в журнале появятся одинаково.
        """
        done = 0
        for sub in queryset.filter(auto_renew=True):
            cancel_autorenew(sub, reason=f"Отказ принят оператором {request.user}")
            done += 1
        self.message_user(request, f"Автопродление отключено: {done}", messages.SUCCESS)


class NpdReceiptFilter(admin.SimpleListFilter):
    """Фильтр «чек НПД выдан / не выдан».

    Главный рабочий инструмент на НПД: список платежей, по которым чек ещё не
    выписан, — это список задач со сроком из ФЗ-422.
    """

    title = "Чек НПД"
    parameter_name = "npd"

    def lookups(self, request, model_admin):
        return (("pending", "Не выдан"), ("done", "Выдан"))

    def queryset(self, request, queryset):
        if self.value() == "pending":
            return queryset.filter(
                status=Payment.Status.SUCCEEDED, npd_receipt_at__isnull=True
            )
        if self.value() == "done":
            return queryset.filter(npd_receipt_at__isnull=False)
        return queryset


class RefundInline(admin.TabularInline):
    """Возвраты по платежу — прямо в карточке, чтобы не искать."""

    model = Refund
    extra = 0
    can_delete = False
    readonly_fields = ("amount", "status", "reason", "comment", "created_by", "created_at")
    fields = readonly_fields


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    """Реестр платежей. Только чтение плюс действие «оформить возврат»."""

    list_display = (
        "created_at",
        "user_email",
        "plan",
        "kind",
        "status",
        "amount",
        "npd_receipt",
        "refunded_amount",
        "refund_link",
    )
    list_filter = ("status", "kind", "plan", "provider", NpdReceiptFilter)
    search_fields = ("user_email", "external_id", "description")
    date_hierarchy = "created_at"
    inlines = (RefundInline,)

    @admin.display(description="Чек НПД")
    def npd_receipt(self, obj):
        """Состояние чека по ФЗ-422 со сроком выдачи.

        Просроченный чек подсвечен красным: это нарушение с конкретной датой,
        и заметить его надо в списке, а не при проверке.
        """
        if USE_KKT_RECEIPTS:
            return "—"  # чек формирует ОФД
        if obj.status != Payment.Status.SUCCEEDED:
            return "—"
        if obj.npd_receipt_at:
            return format_html(
                '<a href="{}" target="_blank">выдан {}</a>',
                obj.npd_receipt_url or "#",
                obj.npd_receipt_at.strftime("%d.%m.%Y"),
            )

        deadline = obj.npd_deadline
        url = reverse("admin:billing_payment_npd_receipt", args=[obj.pk])
        overdue = deadline and deadline < timezone.now()
        return format_html(
            '<a class="button" href="{}" style="{}">{}</a>',
            url,
            "background:#ba2121;color:#fff;" if overdue else "",
            f"просрочен с {deadline:%d.%m}" if overdue else f"выдать до {deadline:%d.%m}",
        )

    # Всё только на чтение: реестр не редактируют, в него дописывают.
    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        # Сведения о платежах хранятся не менее пяти лет (политика
        # конфиденциальности, законодательство о бухучёте) — удалять нельзя.
        return False

    @admin.display(description="Возврат")
    def refund_link(self, obj):
        """Кнопка возврата — только там, где есть что возвращать."""
        if not obj.is_refundable:
            return "—"
        url = reverse("admin:billing_payment_refund", args=[obj.pk])
        return format_html('<a class="button" href="{}">Оформить возврат</a>', url)

    def get_urls(self):
        return [
            path(
                "<int:payment_id>/refund/",
                self.admin_site.admin_view(self.refund_view),
                name="billing_payment_refund",
            ),
            path(
                "<int:payment_id>/npd-receipt/",
                self.admin_site.admin_view(self.npd_receipt_view),
                name="billing_payment_npd_receipt",
            ),
            *super().get_urls(),
        ]

    def npd_receipt_view(self, request, payment_id: int):
        """Приложить ссылку на чек «Мой налог» и отправить его покупателю.

        Сам чек формируется в приложении вручную — автоматизировать это без
        партнёрского доступа к API ФНС нельзя. Здесь только фиксируется ссылка
        и уходит письмо, которое и есть «передача чека покупателю» по
        ч. 1 ст. 14 ФЗ-422.
        """
        payment = Payment.objects.filter(pk=payment_id).first()
        if payment is None or not payment.needs_npd_receipt:
            self.message_user(request, "По этому платежу чек не требуется", messages.ERROR)
            return redirect("admin:billing_payment_changelist")

        if request.method == "POST":
            url = request.POST.get("receipt_url", "").strip()
            if not url.startswith("http"):
                self.message_user(request, "Нужна ссылка на чек целиком", messages.ERROR)
                return redirect(request.path)
            issue_npd_receipt(payment, url, by=str(request.user))
            self.message_user(
                request,
                f"Чек отмечен и отправлен на {payment.user_email}",
                messages.SUCCESS,
            )
            return redirect("admin:billing_payment_changelist")

        context = {
            **self.admin_site.each_context(request),
            "title": f"Чек НПД по платежу №{payment.pk}",
            "payment": payment,
            "plan_label": limits_for(payment.plan)["label"],
            "deadline": payment.npd_deadline,
            "opts": self.model._meta,
        }
        return render(request, "admin/billing/npd_receipt.html", context)

    def refund_view(self, request, payment_id: int):
        """Страница возврата: подсказанная сумма, расчёт и подтверждение.

        Сумму показываем вместе с тем, из чего она получилась. Оператор должен
        видеть расчёт, а не число: у п. 11.2 есть вычет фактических расходов, и
        при споре объяснять придётся именно его.
        """
        payment = Payment.objects.filter(pk=payment_id).first()
        if payment is None or not payment.is_refundable:
            self.message_user(request, "По этому платежу нечего возвращать", messages.ERROR)
            return redirect("admin:billing_payment_changelist")

        spent = period_spend_rub(payment)
        suggested = suggest_refund_amount(payment)

        if request.method == "POST":
            raw = request.POST.get("amount", "").replace(",", ".").strip()
            try:
                amount = Decimal(raw)
            except (InvalidOperation, ValueError):
                self.message_user(request, "Некорректная сумма", messages.ERROR)
                return redirect(request.path)

            try:
                refund = refund_payment(
                    payment,
                    amount,
                    reason=request.POST.get("reason", Refund.Reason.WITHDRAWAL),
                    comment=request.POST.get("comment", ""),
                    created_by=str(request.user),
                )
            except PaymentError as exc:
                self.message_user(request, f"Возврат не прошёл: {exc}", messages.ERROR)
                return redirect(request.path)

            self.message_user(
                request,
                f"Возврат {refund.amount} ₽ оформлен (статус: {refund.get_status_display()})",
                messages.SUCCESS,
            )
            return redirect("admin:billing_payment_change", payment.pk)

        context = {
            **self.admin_site.each_context(request),
            "title": f"Возврат по платежу №{payment.pk}",
            "payment": payment,
            "plan_label": limits_for(payment.plan)["label"],
            "available": payment.amount - payment.refunded_amount,
            "spent": spent,
            "suggested": suggested,
            "reasons": Refund.Reason.choices,
            "opts": self.model._meta,
        }
        return render(request, "admin/billing/refund.html", context)


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    """Проведённые возвраты — только чтение."""

    list_display = ("created_at", "payment", "amount", "status", "reason", "created_by")
    list_filter = ("status", "reason")
    search_fields = ("payment__user_email", "external_id", "comment")

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False


@admin.register(BillingEvent)
class BillingEventAdmin(admin.ModelAdmin):
    """Журнал согласий и списаний — то, чем отвечаем на претензию."""

    list_display = ("created_at", "user", "kind", "note", "ip")
    list_filter = ("kind",)
    search_fields = ("user__email", "note")
    date_hierarchy = "created_at"

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
