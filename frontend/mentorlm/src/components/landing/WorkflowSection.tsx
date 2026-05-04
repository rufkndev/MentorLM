"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { workflow } from "@/lib/landing-contents";

export function WorkflowSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 30%", "end 70%"],
  });
  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section id="workflow" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <header className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <Reveal>
            <p className="text-eyebrow">{workflow.eyebrow}</p>
            <h2 className="text-display mt-4 text-[clamp(2rem,4.6vw,3.6rem)] font-semibold text-ink">
              Три шага до{" "}
              <span className="font-editorial text-gradient">спокойной</span>{" "}
              работы.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-lg leading-relaxed text-muted lg:text-right">
              {workflow.description}
            </p>
          </Reveal>
        </header>

        <div ref={containerRef} className="relative mt-16 grid gap-10 lg:grid-cols-[80px_1fr]">
          {/* progress rail */}
          <div className="relative hidden lg:block">
            <div className="sticky top-32 h-[420px]">
              <div className="relative mx-auto h-full w-px bg-[var(--brand-line)]">
                <motion.div
                  style={{ height: lineHeight }}
                  className="absolute left-0 top-0 w-px origin-top bg-gradient-to-b from-[var(--brand-primary)] to-[var(--brand-violet)]"
                />
              </div>
            </div>
          </div>

          <ol className="flex flex-col gap-6">
            {workflow.steps.map((step, i) => (
              <Step key={step.n} step={step} index={i} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Step({
  step,
  index,
}: {
  step: { n: string; title: string; text: string };
  index: number;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 80%", "end 40%"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.4, 1], [0.4, 1, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [24, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.4], [0.98, 1]);

  return (
    <motion.li
      ref={ref}
      style={{ opacity, y, scale }}
      className={cn(
        "glass-card relative flex flex-col gap-4 p-8 sm:p-10",
        "min-h-[220px]"
      )}
    >
      <div className="flex items-center gap-4">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--brand-primary)] font-mono text-[12px] font-medium text-white">
          {step.n}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
          step {index + 1} / {3}
        </span>
      </div>
      <h3 className="text-2xl font-semibold tracking-tight text-ink">
        {step.title}
      </h3>
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        {step.text}
      </p>
      <div
        aria-hidden
        className="mt-auto h-px w-16 bg-gradient-to-r from-[var(--brand-primary)] to-transparent"
      />
    </motion.li>
  );
}
