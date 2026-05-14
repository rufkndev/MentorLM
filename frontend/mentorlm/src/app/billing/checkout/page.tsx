"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CreditCard, Shield } from "lucide-react";

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutShell plan="…" />}>
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const params = useSearchParams();
  const plan = params.get("plan") ?? "pro";
  return <CheckoutShell plan={plan.toUpperCase()} />;
}

function CheckoutShell({ plan }: { plan: string }) {
  return (
    <section className="mx-auto max-w-md px-6 py-20">
      <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-line">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]">
          <CreditCard className="h-5 w-5" strokeWidth={1.7} />
        </span>
        <h1 className="text-display mt-5 text-[24px] font-semibold text-ink">
          Оформление подписки
        </h1>
        <p className="mt-2 text-[13.5px] text-muted">
          План: <span className="font-medium text-ink">{plan}</span>
        </p>

        <div className="mt-6 rounded-xl bg-paper-2/40 px-4 py-5 text-left">
          <p className="text-[13px] text-ink-soft">
            На этой странице появится форма оплаты — интеграция со Stripe /
            ЮKassa. Сейчас это заглушка.
          </p>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
            <Shield className="h-3.5 w-3.5" strokeWidth={1.8} />
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
