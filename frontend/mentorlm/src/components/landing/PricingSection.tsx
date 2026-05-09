import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { pricing } from "@/lib/landing-contents";

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <header className="mx-auto max-w-3xl text-center">
            <p className="text-eyebrow">{pricing.eyebrow}</p>
            <h2 className="text-display mt-4 text-[clamp(2rem,4.6vw,3.6rem)] font-semibold text-ink">
              Начните{" "}
              <span className="font-editorial text-gradient">бесплатно</span>.
              Платите, когда станет тесно.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              {pricing.description}
            </p>
          </header>
        </Reveal>

        <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
          {pricing.plans.map((plan, i) => (
            <Reveal key={plan.name} delay={0.07 * (i + 1)} className="h-full">
              {plan.featured ? (
                <FeaturedPlan plan={plan} />
              ) : (
                <PlainPlan plan={plan} />
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

type Plan = (typeof pricing.plans)[number];

function PlainPlan({ plan }: { plan: Plan }) {
  return (
    <GlassCard
      as="article"
      className="flex h-full flex-col p-7"
    >
      <PlanHead plan={plan} />
      <PlanFeatures plan={plan} />
      <div className="mt-auto pt-8">
        <Button
          href={plan.cta.href}
          variant="secondary"
          className="w-full"
        >
          {plan.cta.label}
        </Button>
      </div>
    </GlassCard>
  );
}

function FeaturedPlan({ plan }: { plan: Plan }) {
  return (
    <article
      className="lift relative flex h-full flex-col rounded-[var(--radius-lg)] p-7 text-white shadow-[0_30px_80px_-30px_rgba(7,27,77,0.55)]"
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, rgba(86,217,255,0.4) 0%, transparent 50%), radial-gradient(120% 80% at 100% 100%, rgba(123,97,255,0.45) 0%, transparent 55%), linear-gradient(180deg, #071B4D 0%, #0E1F58 100%)",
      }}
    >
      <span className="absolute left-7 top-0 z-10 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-white shadow-[0_8px_20px_-6px_rgba(23,70,245,0.6)]">
        Рекомендуем
      </span>
      <PlanHead plan={plan} featured />
      <PlanFeatures plan={plan} featured />
      <div className="mt-auto pt-8">
        <Button href={plan.cta.href} variant="primary" className="w-full">
          {plan.cta.label}
        </Button>
      </div>
    </article>
  );
}

function PlanHead({ plan, featured }: { plan: Plan; featured?: boolean }) {
  return (
    <>
      <h3
        className={cn(
          "text-lg font-semibold tracking-tight",
          featured ? "text-white" : "text-ink"
        )}
      >
        {plan.name}
      </h3>
      <div className="mt-6 flex items-baseline gap-2">
        <span
          className={cn(
            "text-display text-4xl font-semibold",
            featured ? "text-white" : "text-ink"
          )}
        >
          {plan.price}
        </span>
        <span
          className={cn(
            "text-sm",
            featured ? "text-white/70" : "text-muted"
          )}
        >
          {plan.cadence}
        </span>
      </div>
      <p
        className={cn(
          "mt-3 text-[15px] leading-relaxed",
          featured ? "text-white/80" : "text-ink-soft"
        )}
      >
        {plan.description}
      </p>
    </>
  );
}

function PlanFeatures({ plan, featured }: { plan: Plan; featured?: boolean }) {
  return (
    <ul className="mt-6 space-y-2.5">
      {plan.features.map((f) => (
        <li
          key={f}
          className={cn(
            "flex items-start gap-2 text-[14px]",
            featured ? "text-white/85" : "text-ink-soft"
          )}
        >
          <Check featured={featured} />
          {f}
        </li>
      ))}
    </ul>
  );
}

function Check({ featured }: { featured?: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full",
        featured
          ? "bg-white/15 text-white"
          : "bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"
      )}
      aria-hidden
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
        <path
          d="M2.5 6.5l2.4 2.2L9.5 3.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
