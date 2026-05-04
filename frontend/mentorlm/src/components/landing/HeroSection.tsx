"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { hero } from "@/lib/landing-contents";

export function HeroSection() {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 60, damping: 18, mass: 0.6 });

  const orbX = useTransform(sx, (v) => v * 24);
  const orbY = useTransform(sy, (v) => v * 24);
  const cardLX = useTransform(sx, (v) => v * -36);
  const cardLY = useTransform(sy, (v) => v * -18);
  const cardRX = useTransform(sx, (v) => v * 36);
  const cardRY = useTransform(sy, (v) => v * 18);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      mx.set((e.clientX / w - 0.5) * 2);
      my.set((e.clientY / h - 0.5) * 2);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mx, my]);

  const [first, second, third] = hero.title;

  return (
    <section className="relative h-screen min-h-[760px] w-full overflow-hidden">
      <div className="aurora" aria-hidden />
      <div className="absolute inset-0 grid-paper opacity-[0.3]" aria-hidden />
      <div className="noise absolute inset-0" aria-hidden />

      <motion.div
        aria-hidden
        style={{ x: orbX, y: orbY }}
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2"
      >
        <Orb />
      </motion.div>

      <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col items-center justify-center px-6 text-center">
        <h1 className="text-display max-w-5xl text-[clamp(2.6rem,7.4vw,5.8rem)] font-semibold text-ink">
          <Line delay={0.05}>{first}</Line>
          <Line delay={0.15}>{second}</Line>
          <Line delay={0.25}>
            <span className="font-editorial text-gradient">{third}</span>
          </Line>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-7 max-w-2xl text-[17px] leading-relaxed text-ink-soft"
        >
          {hero.description}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex justify-center"
        >
          <Button href={hero.primary.href} size="lg">
            {hero.primary.label}
            <Arrow />
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.7 }}
          className="text-eyebrow mt-14"
        >
          {hero.eyebrow}
        </motion.p>
      </div>

      {/* floating glass chips with mouse parallax */}
      <motion.div
        aria-hidden
        style={{ x: cardLX, y: cardLY }}
        className="pointer-events-none absolute left-[6%] top-[30%] hidden lg:block"
      >
        <FloatingChip
          label="Chat"
          tag="active"
          accent
          className="animate-float"
        />
      </motion.div>

      <motion.div
        aria-hidden
        style={{ x: cardRX, y: cardRY }}
        className="pointer-events-none absolute right-[7%] top-[28%] hidden lg:block"
      >
        <FloatingChip
          label="Library"
          tag="32 PDF"
          className="animate-float [animation-delay:-2.5s]"
        />
      </motion.div>

      <motion.div
        aria-hidden
        style={{ x: cardRX, y: cardRY }}
        className="pointer-events-none absolute right-[10%] bottom-[18%] hidden lg:block"
      >
        <FloatingChip
          label="Notes · Markdown"
          tag="ctx"
          className="animate-float [animation-delay:-5s]"
        />
      </motion.div>

      <motion.div
        aria-hidden
        style={{ x: cardLX, y: cardLY }}
        className="pointer-events-none absolute left-[8%] bottom-[20%] hidden lg:block"
      >
        <FloatingChip
          label="Solve · step by step"
          tag="run"
          className="animate-float [animation-delay:-3.5s]"
        />
      </motion.div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-paper"
      />

      <ScrollHint />
    </section>
  );
}

function Line({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <span className="block overflow-hidden">
      <motion.span
        initial={{ y: "115%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
        className="block"
      >
        {children}
      </motion.span>
    </span>
  );
}

function FloatingChip({
  label,
  tag,
  accent,
  className,
}: {
  label: string;
  tag: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`glass-strong flex items-center gap-3 rounded-full px-4 py-2 ${className ?? ""}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${accent ? "bg-[var(--brand-primary)]" : "bg-[var(--brand-violet)]"}`}
      />
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {tag}
      </span>
    </div>
  );
}

function Orb() {
  return (
    <div className="relative h-full w-full">
      <div
        className="absolute inset-0 rounded-full opacity-90"
        style={{
          background:
            "radial-gradient(closest-side, rgba(86,217,255,0.55), rgba(123,97,255,0.35) 45%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />
      <div
        className="absolute inset-[18%] rounded-full"
        style={{
          background:
            "conic-gradient(from 220deg at 50% 50%, rgba(23,70,245,0.55), rgba(86,217,255,0.65), rgba(123,97,255,0.55), rgba(23,70,245,0.55))",
          filter: "blur(30px)",
          animation: "orb-spin 28s linear infinite",
        }}
      />
      <div
        className="absolute inset-[28%] rounded-full bg-white/20 backdrop-blur-2xl"
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.6), inset 0 0 0 1px rgba(255,255,255,0.25)",
        }}
      />
    </div>
  );
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8h10m0 0L9 4m4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScrollHint() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.2, duration: 0.8 }}
      className="absolute bottom-6 left-1/2 -translate-x-1/2"
    >
      <div className="flex items-center gap-2 rounded-full border border-line/80 bg-white/40 px-3 py-1 backdrop-blur">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          scroll
        </span>
        <motion.span
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="text-[10px] text-muted"
        >
          ↓
        </motion.span>
      </div>
    </motion.div>
  );
}
