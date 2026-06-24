"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { billingPlans, type BillingPlan } from "@/lib/billing-contents";

export default function BillingPage() {
  return (
    <div className="relative pb-32 pt-20 sm:pt-28">
      <HeroSection />
      <PlansSection />
    </div>
  );
}

/*  hero  */

function HeroSection() {
  return (
    <section className="relative">
      {/* мягкий цветной orb за заголовком — узнаваемый стиль landing */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-80px] -z-0 h-[440px] w-[760px] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(closest-side, rgba(86,217,255,0.20), rgba(123,97,255,0.16) 45%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        <Reveal>
          <p className="text-eyebrow">Mentor Pro</p>
        </Reveal>

        <Reveal delay={0.05}>
          <h1 className="text-display mt-5 text-[clamp(2.4rem,5.4vw,3.8rem)] font-semibold leading-[1.1] text-ink">
            Учитесь{" "}
            <span className="font-editorial text-gradient">глубже</span>.
            <br className="hidden sm:block" /> Без лимитов и компромиссов.
          </h1>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-ink-soft sm:text-[17px]">
            Безлимит сообщений, продвинутые модели Mentor Pro и Vision,
            контекст до 200K токенов, веб-поиск, PDF и приоритетная очередь.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/*  plans  */

function PlansSection() {
  return (
    <section className="relative mt-16 sm:mt-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-stretch gap-5 md:grid-cols-3">
          {billingPlans.map((plan, i) => (
            <Reveal key={plan.id} delay={0.08 * (i + 1)} className="h-full">
              <PlanCard plan={plan} />
            </Reveal>
          ))}
        </div>

        <p className="mt-7 text-center text-[12.5px] text-muted">
          Цены в рублях, НДС включён · Отмена в один клик в любой момент
        </p>
      </div>
    </section>
  );
}

/*   единая карточка для всех планов  */

function PlanCard({ plan }: { plan: BillingPlan }) {
  const featured = !!plan.featured;

  /*
   * Одна и та же внутренняя структура для всех трёх карточек, чтобы названия
   * и цены выравнивались по горизонтали. Featured отличается только фоном
   * (тёмный градиент) и цветами текста, но не геометрией.
   */
  return (
    <article
      className={cn(
        "relative flex h-full flex-col rounded-[var(--radius-lg)] p-7",
        featured
          ? "text-white shadow-[0_28px_70px_-26px_rgba(7,27,77,0.55)] transition-all duration-300 ease-out hover:-translate-y-[3px] hover:shadow-[0_38px_90px_-26px_rgba(7,27,77,0.7)]"
          : "glass-card text-ink"
      )}
      style={
        featured
          ? {
              background:
                "radial-gradient(120% 80% at 0% 0%, rgba(86,217,255,0.4) 0%, transparent 50%), radial-gradient(120% 80% at 100% 100%, rgba(123,97,255,0.45) 0%, transparent 55%), linear-gradient(180deg, #071B4D 0%, #0E1F58 100%)",
            }
          : undefined
      }
    >
      <PlanTag tagline={plan.tagline} featured={featured} />

      <div className="mt-5">
        <h3
          className={cn(
            "text-[19px] font-semibold tracking-tight",
            featured ? "text-white" : "text-ink"
          )}
        >
          {plan.name}
        </h3>

        <Price plan={plan} featured={featured} />

        <p
          className={cn(
            "mt-4 text-[14px] leading-relaxed",
            featured ? "text-white/80" : "text-ink-soft"
          )}
        >
          {plan.description}
        </p>
      </div>

      <ul className="mt-6 space-y-2.5">
        {plan.features.map((f) => (
          <li
            key={f}
            className={cn(
              "flex items-start gap-2.5 text-[13.5px]",
              featured ? "text-white/85" : "text-ink-soft"
            )}
          >
            <span
              className={cn(
                "mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full",
                featured
                  ? "bg-white/15 text-white"
                  : "bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"
              )}
              aria-hidden
            >
              <Check className="h-3 w-3" strokeWidth={2.4} />
            </span>
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <PlanCta plan={plan} featured={featured} />
      </div>
    </article>
  );
}

function PlanTag({
  tagline,
  featured,
}: {
  tagline?: string;
  featured: boolean;
}) {
  if (!tagline) {
    /* единая высота с другими карточками: пустая невидимая плашка */
    return <span className="invisible inline-block h-5" aria-hidden />;
  }
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest",
        featured
          ? "bg-white/15 text-white"
          : "bg-paper-2/70 text-muted"
      )}
    >
      {tagline}
    </span>
  );
}

function Price({ plan, featured }: { plan: BillingPlan; featured: boolean }) {
  if (plan.price === null) {
    return (
      <p
        className={cn(
          "text-display mt-5 text-[30px] font-semibold leading-none tracking-tight",
          featured ? "text-white" : "text-ink"
        )}
      >
        По запросу
      </p>
    );
  }

  return (
    <div className="mt-5 flex items-baseline gap-2">
      <span
        className={cn(
          "text-display text-[44px] font-semibold leading-none tracking-tight",
          featured ? "text-white" : "text-ink"
        )}
      >
        {plan.price} ₽
      </span>
      <span
        className={cn(
          "text-[13px]",
          featured ? "text-white/70" : "text-muted"
        )}
      >
        / месяц
      </span>
    </div>
  );
}

function PlanCta({
  plan,
  featured,
}: {
  plan: BillingPlan;
  featured: boolean;
}) {
  const cta = plan.cta;

  if (cta.disabled || !cta.href) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-[13.5px] font-medium",
          featured ? "bg-white/10 text-white/70" : "bg-paper-2/60 text-muted"
        )}
      >
        {cta.label}
      </div>
    );
  }

  const isExternal =
    cta.href.startsWith("mailto:") || cta.href.startsWith("http");

  const className = cn(
    "group flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-medium transition-all duration-200",
    featured
      ? "bg-white text-[var(--brand-ink)] shadow-[0_10px_30px_-12px_rgba(255,255,255,0.45)] hover:translate-y-[-1px] hover:bg-white/95"
      : "bg-[var(--brand-ink)] text-white hover:translate-y-[-1px] hover:bg-[var(--brand-ink-soft)]"
  );

  const inner = (
    <>
      {cta.label}
      <ArrowRight
        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
        strokeWidth={1.8}
      />
    </>
  );

  return isExternal ? (
    <a href={cta.href} className={className}>
      {inner}
    </a>
  ) : (
    <Link href={cta.href} className={className}>
      {inner}
    </Link>
  );
}
