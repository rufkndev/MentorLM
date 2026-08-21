/**
 * Страница оформления подписки (/billing/checkout).
 * Показывает сводку выбранного плана из ?plan= (данные — billing-contents) и
 * место под форму оплаты (ЮKassa появится позже).
 *
 * Здесь же — единственное место, где неподтверждённая почта что-то запрещает.
 * Сам продукт работает и без подтверждения; упирается только оплата, потому что
 * с этого момента нам нужно уметь отправить человеку чек и предупреждение об
 * автосписании за 24 часа (ФЗ-376). На бэкенде то же правило — пермишен
 * `EmailVerified` (apps/users/permissions.py), который вешается на платёжные
 * эндпоинты; экран ниже нужен, чтобы человек увидел причину, а не голый 403.
 */

"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, CreditCard, MailCheck, Shield } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useResendVerification } from "@/components/auth/useResendVerification";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { authContents } from "@/lib/auth-contents";
import { billingPlans, type BillingPlan } from "@/lib/billing-contents";

const gate = authContents.verifyGate;

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

  const { status, user } = useAuth();
  const router = useRouter();

  // Платить может только тот, у кого есть аккаунт: без него мы не знаем ни
  // кому продлевать подписку, ни куда слать чек.
  useEffect(() => {
    if (status === "anon") {
      const next = planId ? `/billing/checkout?plan=${planId}` : "/billing/checkout";
      router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
    }
  }, [status, planId, router]);

  // Пока выясняем, есть ли сессия, показывать нечего: и форма оплаты, и
  // заслонка были бы одинаково преждевременны.
  if (status !== "authed") return null;

  if (user && !user.email_verified) return <VerifyGate />;

  return <CheckoutShell plan={plan} />;
}

// Заслонка вместо формы оплаты, пока адрес не подтверждён.
function VerifyGate() {
  const { state, error, resend } = useResendVerification();
  const sent = state === "sent";

  return (
    <section className="relative flex min-h-screen items-center justify-center px-6 py-24">
      <div className="glass-strong relative w-full max-w-md rounded-[var(--radius-lg)] p-8">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]">
          <MailCheck className="h-5 w-5" strokeWidth={1.7} />
        </span>

        <h1 className="text-display mt-4 text-[22px] font-semibold text-ink">
          {gate.title}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{gate.text}</p>

        {sent ? (
          <p className="mt-5 rounded-xl border border-line bg-surface/70 px-4 py-3 text-[13.5px] text-ink-soft">
            {gate.sent}
          </p>
        ) : (
          <>
            {error && (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-red-200 bg-red-50/50 px-3.5 py-2.5 text-[13px] text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
              >
                {error}
              </p>
            )}
            <p className="mt-4 text-[13px] leading-relaxed text-muted">{gate.hint}</p>
            <Button
              onClick={resend}
              disabled={state === "sending"}
              magnetic={false}
              className="mt-5 w-full"
            >
              {state === "sending" ? gate.sending : gate.action}
            </Button>
          </>
        )}

        <Link
          href="/billing"
          className="mt-6 inline-flex items-center gap-2 text-[13.5px] text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
          {gate.back}
        </Link>
      </div>
    </section>
  );
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
