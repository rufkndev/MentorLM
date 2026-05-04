import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { features } from "@/lib/landing-contents";

const bento = [
  "md:col-span-2 md:row-span-1",
  "md:col-span-1 md:row-span-1",
  "md:col-span-1 md:row-span-1",
  "md:col-span-2 md:row-span-1",
  "md:col-span-2 md:row-span-1",
  "md:col-span-1 md:row-span-1",
];

const visuals = [Visual0, Visual1, Visual2, Visual3, Visual4, Visual5];

export function FeaturesSection() {
  return (
    <section id="features" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <header className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <Reveal>
            <p className="text-eyebrow">{features.eyebrow}</p>
            <h2 className="text-display mt-4 text-[clamp(2rem,4.6vw,3.6rem)] font-semibold text-ink">
              Режимы под{" "}
              <span className="font-editorial text-gradient">каждую</span>{" "}
              учебную задачу.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-lg leading-relaxed text-muted lg:text-right">
              {features.description}
            </p>
          </Reveal>
        </header>

        <div className="mt-14 grid auto-rows-[minmax(220px,auto)] grid-cols-1 gap-4 md:grid-cols-3">
          {features.items.map((item, i) => {
            const Visual = visuals[i] ?? Visual0;
            return (
              <Reveal key={item.title} delay={0.05 * (i + 1)} className={bento[i]}>
                <GlassCard
                  as="article"
                  className={cn(
                    "group relative flex h-full flex-col justify-between overflow-hidden p-6"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--brand-primary)]">
                      {item.tag}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)] opacity-50 transition-opacity duration-500 group-hover:opacity-100" />
                  </div>

                  <div className="my-6 min-h-[80px]">
                    <Visual />
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-ink">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                      {item.text}
                    </p>
                  </div>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* — visuals: lightweight, on-brand, abstract — */

function Visual0() {
  return (
    <div className="flex items-center gap-2">
      {[
        "Привет. Объясни тему по моим лекциям",
        "Конечно. Возьму конспект 04 и…",
      ].map((t, i) => (
        <div
          key={i}
          className={cn(
            "rounded-2xl border px-3 py-2 text-[12px]",
            i === 0
              ? "border-line bg-white/70 text-ink-soft"
              : "border-transparent bg-[var(--brand-primary)] text-white"
          )}
        >
          {t}
        </div>
      ))}
    </div>
  );
}

function Visual1() {
  return (
    <pre className="overflow-hidden rounded-xl border border-line bg-[#0B1226] p-3 font-mono text-[11px] leading-relaxed text-[var(--brand-blue-soft)]">
      <code>
        {"function "}
        <span className="text-[var(--brand-focus)]">solve</span>
        {"(n) {\n  "}
        <span className="text-[var(--brand-violet)]">return</span>
        {" n * (n + 1) / 2;\n}"}
      </code>
    </pre>
  );
}

function Visual2() {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-5 rounded",
            i % 4 === 0 ? "bg-[var(--brand-primary)]" : "bg-[var(--brand-line)]"
          )}
        />
      ))}
    </div>
  );
}

function Visual3() {
  return (
    <div className="space-y-1.5">
      {[80, 56, 72].map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted">¶ {i + 1}</span>
          <span
            className="h-1.5 rounded-full bg-[var(--brand-line)]"
            style={{ width: `${w}%` }}
          >
            <span
              className="block h-full rounded-full bg-[var(--brand-ink)]"
              style={{ width: `${w * 0.7}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function Visual4() {
  return (
    <ol className="flex items-center gap-2 font-mono text-[11px]">
      {["x = 2", "→ 4", "→ 16", "= 256"].map((s, i) => (
        <li
          key={s}
          className={cn(
            "rounded-full border px-2.5 py-1",
            i === 3
              ? "border-transparent bg-[var(--brand-primary)] text-white"
              : "border-line bg-white/70 text-ink-soft"
          )}
        >
          {s}
        </li>
      ))}
    </ol>
  );
}

function Visual5() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-2">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle
          cx="7"
          cy="7"
          r="4.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M11 11l3 3"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-mono text-[11px] text-muted">
        теорема о промежуточном значении
      </span>
    </div>
  );
}
