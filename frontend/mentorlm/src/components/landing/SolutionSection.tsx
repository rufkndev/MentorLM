"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { solution } from "@/lib/landing-contents";

const modes = [
  { key: "Chat", hint: "поясни тему по моим лекциям" },
  { key: "Code", hint: "почему этот алгоритм O(n log n)" },
  { key: "Library", hint: "найди определение в моих PDF" },
  { key: "Notes", hint: "сделай конспект из ответа" },
];

export function SolutionSection() {
  const [active, setActive] = useState(0);

  return (
    <section className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="text-eyebrow">{solution.eyebrow}</p>
            <h2 className="text-display mt-4 text-[clamp(2rem,4.6vw,3.6rem)] font-semibold text-ink">
              Единое пространство, которое{" "}
              <span className="font-editorial text-gradient">понимает</span>{" "}
              ваш контекст.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              {solution.description}
            </p>

            <dl className="mt-10 grid grid-cols-3 gap-3">
              {solution.highlights.map((h, i) => (
                <Reveal key={h.label} delay={0.06 * (i + 1)}>
                  <div className="rounded-2xl border border-line bg-paper-2/70 p-4 backdrop-blur">
                    <dt className="text-eyebrow">{h.label}</dt>
                    <dd className="mt-2 text-base font-medium text-ink">
                      {h.value}
                    </dd>
                  </div>
                </Reveal>
              ))}
            </dl>
          </Reveal>

          <Reveal delay={0.15}>
            <SolutionVisual active={active} setActive={setActive} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function SolutionVisual({
  active,
  setActive,
}: {
  active: number;
  setActive: (i: number) => void;
}) {
  return (
    <div className="relative aspect-[4/5] w-full max-w-md justify-self-center lg:justify-self-end">
      <div
        aria-hidden
        className="absolute inset-0 rounded-[36px]"
        style={{
          background:
            "radial-gradient(120% 80% at 30% 20%, var(--brand-blue-soft) 0%, transparent 60%), radial-gradient(120% 80% at 80% 90%, rgba(123,97,255,0.45) 0%, transparent 60%), linear-gradient(180deg, var(--brand-paper-2), var(--brand-paper))",
        }}
      />
      <div className="absolute inset-6 glass-strong flex flex-col gap-3 rounded-[28px] p-5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[var(--brand-primary)]" />
          <div className="h-2 w-2 rounded-full bg-[var(--brand-violet)]" />
          <div className="h-2 w-2 rounded-full bg-[var(--brand-focus)]" />
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted">
            mentor · workspace
          </span>
        </div>

        <div className="space-y-2">
          {modes.map((m, i) => (
            <button
              key={m.key}
              onClick={() => setActive(i)}
              className={cn(
                "relative flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition-colors",
                i === active
                  ? "border-transparent text-white"
                  : "border-line bg-white/60 text-ink-soft hover:bg-white/80"
              )}
            >
              {i === active && (
                <motion.span
                  layoutId="solution-active"
                  className="absolute inset-0 -z-0 rounded-xl bg-[var(--brand-primary)]"
                  transition={{ type: "spring", stiffness: 280, damping: 28 }}
                />
              )}
              <span className="relative">{m.key}</span>
              <span className="relative font-mono text-[10px] opacity-70">
                {i === active ? "active" : "—"}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-auto rounded-2xl border border-line bg-white/70 p-3">
          <motion.p
            key={active}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="text-[12px] text-muted"
          >
            {modes[active].hint}
          </motion.p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]" />
            <span
              className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]"
              style={{ animationDelay: "0.2s" }}
            />
            <span
              className="thinking-dot h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]"
              style={{ animationDelay: "0.4s" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
