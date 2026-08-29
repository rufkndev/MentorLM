/*
 * Вкладка «Платежи»: история операций по подписке.
 *
 * Отдельно от «Подписки» намеренно: там управление (что будет дальше), здесь
 * реестр (что уже случилось). Смешивать их — значит прятать кнопку отказа от
 * автосписаний под списком из двух десятков строк.
 *
 * Идентификатор платежа в ЮKassa показан не для красоты: с ним обращение в
 * поддержку или в банк решается за один заход. Реквизитов карты здесь нет и
 * быть не может — только последние четыре цифры, которые вернул платёжный
 * сервис.
 *
 * Про чеки: Исполнитель — ИП на НПД и ККТ не применяет (п. 2.2 ст. 2 ФЗ-54),
 * поэтому чек приходит не от оператора фискальных данных, а отдельным письмом
 * со ссылкой на чек в сервисе ФНС (ФЗ-422).
 */

"use client";

import { useEffect, useState } from "react";
import { Loader2, Receipt } from "lucide-react";
import { Section } from "../controls";
import type { PaymentRecord } from "@/components/mainapp/SubscriptionProvider";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/cn";

// Дата и время операции в зоне пользователя: «22 августа 2026, 14:31».
function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Сумма без лишних нулей: 1499.00 → «1 499 ₽».
function formatAmount(value: string): string {
  const num = Number(value);
  if (Number.isNaN(num)) return `${value} ₽`;
  return `${num.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

// Цвет статуса. Успех намеренно нейтральный: подсвечивать надо исключения,
// а оплаченный платёж — норма, и зелёный на каждой строке только шумит.
function statusTone(status: PaymentRecord["status"]): string {
  if (status === "canceled") return "text-[#d4334a]";
  if (status === "succeeded") return "text-ink-soft";
  return "text-[#e08a1e]";
}

function PaymentRow({ payment }: { payment: PaymentRecord }) {
  const refunded = payment.refunded;
  return (
    <li className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink">
          {payment.plan_label}
          <span className="ml-2 font-normal text-muted">{payment.kind_label}</span>
        </p>
        <p className="mt-0.5 text-[12px] text-muted">
          {formatMoment(payment.created_at)}
          {/* Способ оплаты собирает бэкенд: у не-карточных способов нет ни
              маски, ни платёжной системы, и склеивать подпись здесь значило бы
              называть картой, например, СБП. */}
          {payment.method_label && <> · {payment.method_label}</>}
        </p>
        {payment.external_id && (
          <p className="mt-0.5 font-mono text-[10.5px] text-muted/80">
            {payment.external_id}
          </p>
        )}

        {/* Чек. Пока он не выписан, честно пишем «готовится»: у оплаченного
            платежа человек ищет чек, и молчание он читает как «его не будет». */}
        {payment.status === "succeeded" &&
          (payment.npd_receipt_url ? (
            <a
              href={payment.npd_receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[12px] text-[var(--brand-primary)] underline-offset-2 hover:underline"
            >
              <Receipt className="h-3 w-3" strokeWidth={1.9} aria-hidden />
              Чек
            </a>
          ) : (
            <p className="mt-1 text-[12px] text-muted">Чек готовится</p>
          ))}
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-[13.5px] font-medium text-ink",
            payment.status === "canceled" && "text-muted line-through",
          )}
        >
          {formatAmount(payment.amount)}
        </p>
        <p className={cn("mt-0.5 text-[12px]", statusTone(payment.status))}>
          {payment.status_label}
        </p>
        {refunded && (
          <p className="mt-0.5 text-[11.5px] text-muted">
            возвращено {formatAmount(payment.refunded_amount)}
          </p>
        )}
      </div>
    </li>
  );
}

export function PaymentsTab() {
  const api = useApi();
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<{ results: PaymentRecord[] }>("/api/billing/payments/")
      .then((res) => alive && setPayments(res.results))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [api]);

  return (
    <Section
      title="Платежи"
      description="История операций по подписке. Чек по каждому платежу приходит на вашу почту отдельным письмом."
    >
      <div className="rounded-2xl border border-line bg-paper-2/30 p-5">
        {payments === null && !failed && (
          <p className="flex items-center gap-2 py-4 text-[13px] text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            Загружаем историю…
          </p>
        )}

        {failed && (
          <p className="py-4 text-[13px] text-muted">
            Не удалось загрузить историю платежей. Попробуйте открыть вкладку
            ещё раз.
          </p>
        )}

        {payments !== null && payments.length === 0 && (
          <div className="py-4 text-center">
            <Receipt
              className="mx-auto h-5 w-5 text-muted"
              strokeWidth={1.6}
              aria-hidden
            />
            <p className="mt-2 text-[13px] text-ink-soft">Платежей пока нет</p>
            <p className="mt-1 text-[12.5px] text-muted">
              Здесь появятся все списания и возвраты по подписке.
            </p>
          </div>
        )}

        {payments !== null && payments.length > 0 && (
          <ul>
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} />
            ))}
          </ul>
        )}
      </div>

      <p className="text-[12.5px] leading-relaxed text-muted">
        Возврат оформляется по обращению на почту поддержки — мы вернём деньги
        тем же способом, которым была произведена оплата, в срок не более
        10 календарных дней.
      </p>
    </Section>
  );
}
