import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { problem } from "@/lib/landing-contents";

export function ProblemSection() {
  return (
    <section className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <Reveal>
            <p className="text-eyebrow">{problem.eyebrow}</p>
            <h2 className="text-display mt-4 text-[clamp(2rem,4.6vw,3.6rem)] font-semibold text-ink">
              Учёба{" "}
              <span className="font-editorial text-muted">распадается</span>{" "}
              на десятки вкладок.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-lg leading-relaxed text-muted lg:text-right">
              {problem.description}
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {problem.pains.map((p, i) => (
            <Reveal key={p.title} delay={0.05 * (i + 1)}>
              <GlassCard
                as="article"
                className="flex h-full flex-col gap-3 p-7"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                    0{i + 1} / 0{problem.pains.length}
                  </span>
                  <span className="h-1 w-8 rounded-full bg-[var(--brand-line)]">
                    <span
                      className="block h-full rounded-full bg-[var(--brand-primary)]"
                      style={{
                        width: `${((i + 1) / problem.pains.length) * 100}%`,
                      }}
                    />
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink">
                  {p.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-ink-soft">
                  {p.text}
                </p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
