/**
 * Страница оформления подписки (/billing/checkout).
 * Показывает сводку выбранного плана из ?plan= (данные — billing-contents) и
 * место под форму оплаты (Stripe / ЮKassa появится позже).
 */

"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, CreditCard, Shield } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { billingPlans, type BillingPlan } from "@/lib/billing-contents";

// Оборачиваем в Suspense — useSearchParams требует CSR-границы.
export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}

// Достаёт выбранный план из query-параметра ?plan= (по умолчанию — Plus).
function CheckoutInner() {
  const params = useSearchParams();
  const planId = params.get("plan");
  const plan =
    billingPlans.find((p) => p.id === planId) ??
    billingPlans.find((p) => p.id === "plus")!;
  return <CheckoutShell plan={plan} />;
}

// Сводка плана + заглушка формы оплаты.
function CheckoutShell({ plan }: { plan: BillingPlan }) {
  return (
    <section className="relative flex min-h-screen items-center justify-center px-6 py-24">
      {/* мягкое свечение позади карточки — как на странице тарифов */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[420px] w-[640px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(closest-side, var(--brand-ice) 0%, transparent 70%)",
          filter: "blur(48px)",
          opacity: 0.7,
        }}
      />

      <div className="glass-strong relative w-full max-w-md rounded-[var(--radius-lg)] p-8">
        {/* Шапка: иконка и заголовок */}
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]">
            <CreditCard className="h-5 w-5" strokeWidth={1.7} />
          </span>
          <div>
            <h1 className="text-display text-[22px] font-semibold text-ink">
              Оформление подписки
            </h1>
            <p className="mt-0.5 text-[13px] text-muted">
              Подписка продлевается ежемесячно
            </p>
          </div>
        </div>

        {/* Сводка выбранного плана */}
        <div className="mt-6 rounded-2xl border border-line bg-surface/70 p-5">
          <div className="flex items-baseline justify-between">
            <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
              <BrandMark size={18} />
              Mentor LM {plan.name}
            </span>
            {plan.price !== null && (
              <span className="text-display text-[22px] font-semibold text-ink">
                {plan.price} ₽
                <span className="ml-1 text-[12px] font-normal text-muted">
                  / месяц
                </span>
              </span>
            )}
          </div>
          <ul className="mt-4 space-y-2">
            {plan.features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-[13px] text-ink-soft"
              >
                <span
                  className="mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"
                  aria-hidden
                >
                  <Check className="h-3 w-3" strokeWidth={2.4} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Заглушка формы оплаты */}
        <div className="mt-4 rounded-2xl border border-dashed border-line px-5 py-4">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Здесь появится форма оплаты — мы подключаем платёжный шлюз. Пока
            оформление недоступно.
          </p>
          <div className="mt-2.5 flex items-center gap-2 text-[12px] text-muted">
            <Shield className="h-3.5 w-3.5 flex-none" strokeWidth={1.8} />
            Платёж пройдёт через защищённый платёжный шлюз
          </div>
        </div>

        <Link
          href="/billing"
          className="mt-6 inline-flex items-center gap-2 text-[13.5px] text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
          Вернуться к тарифам
        </Link>
      </div>
    </section>
  );
}
