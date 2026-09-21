/**
 * Страница оформления подписки (/billing/checkout).
 * Сводка выбранного плана из ?plan= (данные — billing-contents), согласия и
 * переход на платёжную форму ЮKassa («Умный платёж»: человек уходит на форму
 * провайдера, реквизиты карты через нас не проходят вовсе).
 *
 * Два чекбокса здесь — не формальность, а то, чем мы отличаемся от нарушения:
 *  • «Продлевать автоматически» СНЯТ по умолчанию. Предпроставленное согласие
 *    запрещено ст. 16 ЗоЗПП, а п. 7.2 оферты требует именно «выраженного
 *    согласия». Снят — на бэк уходит auto_renew: false, и `save_payment_method`
 *    в ЮKassa не отправляется вовсе: карта не привязывается, списать нечем.
 *  • «Принимаю оферту» — акцепт по п. 4.1: договор заключается нажатием кнопки
 *    оплаты под сформированным заказом.
 *
 * Здесь же — единственное место, где неподтверждённая почта что-то запрещает.
 * Сам продукт работает и без подтверждения; упирается только оплата, потому что
 * с этого момента нам нужно уметь отправить человеку чек и предупреждение об
 * автосписании за 24 часа (ФЗ-376). На бэкенде то же правило — пермишен
 * `EmailVerified` (apps/users/permissions.py), который висит на CheckoutView;
 * экран ниже нужен, чтобы человек увидел причину, а не голый 403.
 */

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CreditCard,
  MailCheck,
  Receipt,
  Shield,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useResendVerification } from "@/components/auth/useResendVerification";
import { useSubscription } from "@/components/mainapp/SubscriptionProvider";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { useApi, ApiError } from "@/hooks/useApi";
import { authContents } from "@/content/auth";
import {
  billingPlans,
  checkoutContents as t,
  type BillingPlan,
} from "@/content/billing";
import { cn } from "@/lib/cn";
import { safeExternalUrl, YOOKASSA_HOSTS } from "@/lib/safe-url";
import { priceOf, usePlanPrices } from "@/hooks/usePlanPrices";

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

// Чекбокс в стиле дизайн-системы: нативный input скрыт, но остаётся в потоке —
// с ним бесплатно работают клавиатура, focus-visible и чтение с экрана.
function CheckBox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 flex-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute h-0 w-0 opacity-0"
        />
        <span
          aria-hidden
          className={cn(
            "grid h-[18px] w-[18px] place-items-center rounded-[6px] border transition-colors",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand-primary)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--brand-surface)]",
            checked
              ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
              : "border-line bg-surface",
          )}
        >
          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </span>
      <span className="text-[13px] leading-relaxed text-ink-soft">{children}</span>
    </label>
  );
}

// Дата окончания оплаченного периода словами — для предупреждения о смене тарифа.
function formatUntil(iso: string | null): string {
  if (!iso) return t.untilFallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t.untilFallback;
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Сводка плана, согласия и переход на форму оплаты.
function CheckoutShell({ plan }: { plan: BillingPlan }) {
  const api = useApi();
  const { sub, isPaid } = useSubscription();
  // Цена с бэкенда: именно она будет списана. Пока ответ не пришёл — запасная
  // из контента, чтобы карточка не мигала пустотой.
  const price = priceOf(plan.id, plan.price, usePlanPrices());

  // Снят по умолчанию — см. комментарий в шапке файла.
  const [autoRenew, setAutoRenew] = useState(false);
  const [acceptOffer, setAcceptOffer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Смена тарифа: текущий период закроется, новый начнётся сегодня. Показываем
  // это до оплаты, а не после — иначе сгоревший остаток станет сюрпризом.
  const isUpgrade = isPaid && sub != null && sub.plan !== plan.id;

  async function pay() {
    if (!acceptOffer) {
      setError(t.errors.needOffer);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ payment_id: number; confirmation_url: string }>(
        "/api/billing/checkout/",
        { plan: plan.id, auto_renew: autoRenew, accept_offer: true },
      );
      // Уходим на форму ЮKassa. Именно assign, а не router.push: адрес внешний,
      // и вернётся человек уже на /billing/return.
      //
      // Адрес проверяем, хотя он и от нашего бэка: это единственное место, где
      // мы уводим пользователя с сайта по данным из ответа API, и уводим прямо
      // с формы оплаты. Ошибка в данных здесь дороже одной проверки.
      const target = safeExternalUrl(res.confirmation_url, YOOKASSA_HOSTS);
      if (!target) {
        setError(t.errors.generic);
        setBusy(false);
        return;
      }
      window.location.assign(target);
    } catch (e) {
      // Сообщение бэка информативнее нашего: он знает, тариф ли уже подключён,
      // не отвечает ли провайдер или не подтверждена почта.
      setError(e instanceof ApiError ? e.message : t.errors.generic);
      setBusy(false);
    }
  }

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
              {t.title}
            </h1>
            {/* С автопродлением бэкенд открывает форму ввода карты, без него —
                обычную форму со всеми способами. Подзаголовок обязан говорить
                то же самое, иначе он врёт в одном из двух состояний. */}
            <p className="mt-0.5 text-[13px] text-muted">
              {autoRenew ? t.subtitleCard : t.subtitle}
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
            <span className="text-display text-[22px] font-semibold text-ink">
              {price} ₽
              <span className="ml-1 text-[12px] font-normal text-muted">
                {t.perMonth}
              </span>
            </span>
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

        {/* Смена тарифа: остаток текущего периода не переносится */}
        {isUpgrade && (
          <div className="mt-4 flex gap-2.5 rounded-2xl border border-[#e08a1e]/35 bg-[#e08a1e]/[0.08] px-4 py-3.5">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 flex-none text-[#c2761a]"
              strokeWidth={1.9}
            />
            <div>
              <p className="text-[13px] font-medium text-ink">
                {t.upgradeWarning.title}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                {t.upgradeWarning.text(
                  sub.plan_label,
                  plan.name,
                  formatUntil(sub.current_period_end),
                )}
              </p>
            </div>
          </div>
        )}

        {/* Согласия */}
        <div className="mt-5 space-y-4 rounded-2xl border border-line bg-surface/70 p-5">
          <div>
            <CheckBox checked={autoRenew} onChange={setAutoRenew}>
              <span className="font-medium text-ink">{t.autoRenew.label}</span>
            </CheckBox>
            <p className="mt-1.5 pl-[30px] text-[12.5px] leading-relaxed text-muted">
              {autoRenew ? t.autoRenew.hint(price) : t.autoRenew.off}
            </p>

            {/* Какой будет форма оплаты — только когда автопродление реально
                просят: тому, кто платит разово, способ оплаты не навязывается.
                Оформление намеренно нейтральное, не «внимание»: это не риск и
                не ограничение, а объяснение того, что человек сейчас увидит. */}
            {autoRenew && (
              <p className="ml-[30px] mt-2 flex gap-2 text-[12.5px] leading-relaxed text-muted">
                <CreditCard
                  className="mt-0.5 h-3.5 w-3.5 flex-none"
                  strokeWidth={1.8}
                  aria-hidden
                />
                {t.autoRenew.methodNotice}
              </p>
            )}
          </div>

          <div className="border-t border-line pt-4">
            <CheckBox checked={acceptOffer} onChange={setAcceptOffer}>
              {t.offer.lead}{" "}
              <Link
                href="/legal/offer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--brand-primary)] underline-offset-2 hover:underline"
              >
                {t.offer.offerLabel}
              </Link>{" "}
              {t.offer.and}{" "}
              <Link
                href="/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--brand-primary)] underline-offset-2 hover:underline"
              >
                {t.offer.privacyLabel}
              </Link>{" "}
              {t.offer.tail}
            </CheckBox>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50/50 px-3.5 py-2.5 text-[13px] text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <Button
          onClick={pay}
          disabled={busy || !acceptOffer}
          magnetic={false}
          className="mt-5 w-full"
        >
          {busy ? t.paying : t.pay(price)}
        </Button>

        <div className="mt-3.5 space-y-1.5">
          <div className="flex items-start gap-2 text-[12px] leading-relaxed text-muted">
            <Shield className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={1.8} />
            {t.secure}
          </div>
          <div className="flex items-start gap-2 text-[12px] leading-relaxed text-muted">
            <Receipt className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={1.8} />
            {t.receipt}
          </div>
        </div>

        <Link
          href="/billing"
          className="mt-6 inline-flex items-center gap-2 text-[13.5px] text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
          {t.back}
        </Link>
      </div>
    </section>
  );
}
