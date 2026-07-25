/**
 * Первый экран лендинга (герой).
 * Крупный заголовок, подзаголовок и главная кнопка; на фоне — светящаяся сфера
 * с лёгким параллаксом от мыши и стеклянные чипсы-метки.
 *
 * Производительность: параллакс применяется ТОЛЬКО к сфере (у неё нет
 * backdrop-filter, поэтому смещение дёшево). Стеклянные чипсы статичны — двигать
 * элемент с backdrop-filter значит пересчитывать блюр фона каждый кадр, что и
 * вызывало просадку FPS. Вращение сферы идёт через transform: rotate по уже
 * размытому слою (кэшированная текстура) — тоже дёшево.
 */

"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionStyle,
} from "motion/react";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";
import { hero } from "@/lib/landing-contents";

// Секция героя.
export function HeroSection() {
  const reduce = useReducedMotion();

  // Позиция мыши (сглаженная пружиной) — источник параллакса сферы и чипсов.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 55, damping: 20, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 55, damping: 20, mass: 0.6 });
  const orbX = useTransform(sx, (v) => v * 26);
  const orbY = useTransform(sy, (v) => v * 26);
  // Чипсы смещаются в противоположные стороны — глубина параллакса.
  // Двигаются только при движении мыши (без постоянной анимации) — это держит
  // FPS: элемент с backdrop-filter пересчитывает преломление лишь когда реально
  // сдвигается, а не каждый кадр.
  const chipLX = useTransform(sx, (v) => v * -34);
  const chipLY = useTransform(sy, (v) => v * -16);
  const chipRX = useTransform(sx, (v) => v * 34);
  const chipRY = useTransform(sy, (v) => v * 16);

  // Обновляем координаты параллакса по позиции курсора.
  useEffect(() => {
    if (reduce) return;
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      mx.set((e.clientX / w - 0.5) * 2);
      my.set((e.clientY / h - 0.5) * 2);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mx, my, reduce]);

  const [first, second, third] = hero.title;

  return (
    <section className="relative flex h-screen min-h-[720px] w-full items-center overflow-hidden">
      <div className="aurora" aria-hidden />
      <div className="absolute inset-0 grid-paper opacity-[0.25]" aria-hidden />

      <motion.div
        aria-hidden
        style={{ x: orbX, y: orbY }}
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 will-change-transform"
      >
        <Orb spin={!reduce} />
      </motion.div>

      {/* Центральный блок: заголовок, описание, кнопка */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 text-center">
        <h1 className="text-display max-w-5xl text-[clamp(2.7rem,7.6vw,6rem)] font-bold text-ink">
          <Line delay={0.05} reduce={reduce}>
            {first}
          </Line>
          <Line delay={0.14} reduce={reduce}>
            {second}
          </Line>
          <Line delay={0.23} reduce={reduce}>
            <span className="font-editorial text-gradient">{third}</span>
          </Line>
        </h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.36, ease: [0.22, 1, 0.36, 1] }}
          className="mt-7 max-w-xl text-[17px] leading-relaxed text-ink-soft"
        >
          {hero.description}
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.46, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex justify-center"
        >
          {/* Кнопка остаётся строго по центру; маскот-компаньон парит слева от неё
              (absolute → не влияет на центрирование и не перекрывает кнопку) */}
          <div className="relative">
            <div className="pointer-events-none absolute right-full top-1/2 mr-6 hidden -translate-y-1/2 md:block">
              <Mascot size={88} expression="happy" float="fly" />
            </div>
            <Button href={hero.primary.href} size="lg">
              {hero.primary.label}
              <Arrow />
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Стеклянные чипсы-метки с параллаксом от мыши (как у сферы) */}
      <FloatingChip
        pos={{ left: "5%", top: "27%" }}
        style={{ x: chipLX, y: chipLY }}
        label="AI-powered"
        tag="чат"
        accent
      />
      <FloatingChip
        pos={{ right: "5%", top: "24%" }}
        style={{ x: chipRX, y: chipRY }}
        label="Исследование"
        tag="веб-поиск"
      />
      <FloatingChip
        pos={{ right: "6%", bottom: "22%" }}
        style={{ x: chipRX, y: chipRY }}
        label="Память диалогов"
        tag="контекст"
      />
      <FloatingChip
        pos={{ left: "7%", bottom: "24%" }}
        style={{ x: chipLX, y: chipLY }}
        label="Работа с кодом"
        tag="код"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-paper"
      />
    </section>
  );
}

// Строка заголовка с эффектом «выезжания» снизу.
function Line({
  children,
  delay = 0,
  reduce,
}: {
  children: React.ReactNode;
  delay?: number;
  reduce?: boolean | null;
}) {
  return (
    <span className="line-mask block">
      <motion.span
        initial={reduce ? false : { y: "115%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
        className="block"
      >
        {children}
      </motion.span>
    </span>
  );
}

// Плавающий стеклянный чип-метка с параллаксом (style: x/y — MotionValue).
function FloatingChip({
  label,
  tag,
  accent,
  pos,
  style,
}: {
  label: string;
  tag: string;
  accent?: boolean;
  pos: {
    left?: string;
    right?: string;
    top?: string;
    bottom?: string;
  };
  style?: MotionStyle;
}) {
  return (
    // position:absolute задаём inline — правило .glass-strong (position:relative)
    // перебивает одноимённую утилиту Tailwind, а inline-стиль сильнее их обоих.
    <motion.div
      style={{ position: "absolute", ...pos, ...style }}
      className="glass-strong glass-plain pointer-events-none z-[5] hidden items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2 will-change-transform xl:flex"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${accent ? "bg-[var(--brand-primary)]" : "bg-[var(--brand-blue-soft)]"}`}
      />
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {tag}
      </span>
    </motion.div>
  );
}

// Светящаяся сфера на фоне героя. Приглушённая; вращение через transform.
function Orb({ spin }: { spin?: boolean }) {
  return (
    <div className="relative h-full w-full">
      {/* мягкое внешнее сияние */}
      <div
        className="absolute inset-0 rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(closest-side, rgba(86,217,255,0.4), rgba(23,70,245,0.24) 46%, transparent 72%)",
          filter: "blur(28px)",
        }}
      />
      {/* цветное ядро — вращается как кэшированная текстура (дёшево) */}
      <div
        className="absolute inset-[16%] rounded-full opacity-70"
        style={{
          background:
            "conic-gradient(from 210deg at 50% 50%, rgba(23,70,245,0.5), rgba(86,217,255,0.55), rgba(120,150,255,0.5), rgba(23,70,245,0.5))",
          filter: "blur(34px)",
          animation: spin ? "orb-spin 40s linear infinite" : "none",
        }}
      />
      {/* стеклянная сердцевина */}
      <div
        className="absolute inset-[30%] rounded-full bg-white/15 backdrop-blur-2xl"
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.55), inset 0 0 0 1px rgba(255,255,255,0.2)",
        }}
      />
    </div>
  );
}

// Иконка-стрелка для кнопки.
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
