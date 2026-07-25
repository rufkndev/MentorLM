/**
 * Маскот Mentor LM — стеклянный компаньон-линза со спокойным «умным» лицом.
 * Не мультяшный «блоб»: премиальная стеклянная сфера (кобальт-градиент, блик
 * преломления, глянец) с минималистичным лицом — два спокойных глаза и лёгкая
 * улыбка. Живой, но сдержанный — в духе «Quiet Intelligence».
 *
 * Настраивается: размер, тон (light/dark), выражение (calm/curious/wink/
 * thinking/happy), зеркалирование, наклон, тип парения (bob/fly). Так один
 * компонент даёт разные позы/эмоции/размеры на разных страницах.
 *
 * Только для маркетинговых страниц. Уважает prefers-reduced-motion.
 * Перф: анимируем только transform/opacity.
 */

"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export type MascotExpression =
  | "calm"
  | "curious"
  | "wink"
  | "thinking"
  | "happy";

export function Mascot({
  size = 104,
  tone = "light",
  expression = "calm",
  flip = false,
  tilt = 0,
  float = "bob",
  glow = true,
  animated = true,
  className,
  idPrefix = "mascot",
}: {
  size?: number;
  tone?: "light" | "dark";
  expression?: MascotExpression;
  /** Отразить по горизонтали (смотрит в другую сторону). */
  flip?: boolean;
  /** Базовый наклон в градусах. */
  tilt?: number;
  /** Парение: мягкое вверх-вниз (bob), «полёт» с покачиванием (fly), нет. */
  float?: "bob" | "fly" | "none";
  glow?: boolean;
  animated?: boolean;
  className?: string;
  idPrefix?: string;
}) {
  const reduce = useReducedMotion();
  const play = animated && !reduce && float !== "none";

  const bodyId = `${idPrefix}-body`;
  const glossId = `${idPrefix}-gloss`;

  const glowBg =
    tone === "dark"
      ? "radial-gradient(closest-side, rgba(86,217,255,0.55), rgba(74,116,255,0.3) 55%, transparent 78%)"
      : "radial-gradient(closest-side, rgba(86,217,255,0.42), rgba(23,70,245,0.18) 55%, transparent 75%)";

  const anim =
    float === "fly"
      ? { y: [0, -9, 0], rotate: [tilt - 3, tilt + 3, tilt - 3] }
      : { y: [0, -7, 0] };

  return (
    <motion.div
      aria-hidden
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size, rotate: play ? undefined : tilt }}
      animate={play ? anim : undefined}
      transition={
        play
          ? { duration: float === "fly" ? 7 : 6, repeat: Infinity, ease: "easeInOut" }
          : undefined
      }
    >
      {/* Мягкое свечение под персонажем */}
      {glow ? (
        <motion.span
          className="pointer-events-none absolute inset-[-18%] rounded-full"
          style={{ background: glowBg, filter: "blur(24px)" }}
          animate={play ? { opacity: [0.5, 0.75, 0.5], scale: [1, 1.04, 1] } : undefined}
          transition={
            play ? { duration: 5, repeat: Infinity, ease: "easeInOut" } : undefined
          }
        />
      ) : null}

      <svg
        width={size}
        height={size}
        viewBox="-6 -6 112 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative drop-shadow-[0_12px_28px_rgba(23,70,245,0.32)]"
      >
        <defs>
          <linearGradient id={bodyId} x1="20" y1="12" x2="74" y2="88" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4C74FF" />
            <stop offset="0.52" stopColor="#1746F5" />
            <stop offset="1" stopColor="#08205E" />
          </linearGradient>
          <radialGradient
            id={glossId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(36 30) rotate(58) scale(22 14)"
          >
            <stop stopColor="#FFFFFF" stopOpacity="0.7" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g transform={flip ? "translate(100,0) scale(-1,1)" : undefined}>
          {/* Стеклянная сфера */}
          <circle cx="50" cy="50" r="38" fill={`url(#${bodyId})`} />
          {/* Светлая кромка преломления */}
          <circle
            cx="50"
            cy="50"
            r="38"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.4"
            strokeWidth="1.3"
          />
          {/* Дуга-блик преломления (как в логотипе) */}
          <path
            d="M24 36 A30 30 0 0 1 45 20"
            stroke="#FFFFFF"
            strokeOpacity="0.55"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />
          {/* Мягкий глянец */}
          <ellipse cx="36" cy="30" rx="20" ry="13" fill={`url(#${glossId})`} />
          {/* Холодный specular-фокус (нод к «апертуре» логотипа) */}
          <circle cx="64" cy="33" r="2.2" fill="#BFEFFF" fillOpacity="0.85" />

          {/* Лицо — минималистичное, спокойное */}
          <Face expression={expression} />
        </g>
      </svg>
    </motion.div>
  );
}

// Глаза и рот под конкретное выражение. Пять чётко различимых эмоций:
// calm (спокойный), happy (радостный, глаза-дуги), curious (смотрит вверх,
// рот «o»), wink (подмигивает), thinking (взгляд в сторону, ровный рот).
function Face({ expression }: { expression: MascotExpression }) {
  const ink = "#0A1B44";
  const lx = 41;
  const rx = 59;
  const y = 50;

  // Направление взгляда.
  const look =
    expression === "curious"
      ? { dx: 0, dy: -2.6 }
      : expression === "thinking"
        ? { dx: 2.8, dy: -1.2 }
        : { dx: 0, dy: 0 };

  return (
    <>
      {/* Левый глаз */}
      {expression === "happy" ? (
        <ArcEye cx={lx} cy={y} ink={ink} />
      ) : (
        <OpenEye cx={lx + look.dx} cy={y + look.dy} ink={ink} />
      )}

      {/* Правый глаз (дуга у happy и wink) */}
      {expression === "happy" || expression === "wink" ? (
        <ArcEye cx={rx} cy={y} ink={ink} />
      ) : (
        <OpenEye cx={rx + look.dx} cy={y + look.dy} ink={ink} />
      )}

      {/* Рот — свой для каждой эмоции */}
      {expression === "happy" ? (
        <path d="M43.5 62 Q50 68.5 56.5 62" stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none" />
      ) : expression === "wink" ? (
        <path d="M45 62.5 Q50 67 55 62.5" stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      ) : expression === "curious" ? (
        <ellipse cx="50" cy="64" rx="2.5" ry="3" fill={ink} />
      ) : expression === "thinking" ? (
        <path d="M47.5 64 L54 64" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        // calm — мягкая короткая улыбка
        <path d="M46 63 Q50 65.6 54 63" stroke={ink} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      )}
    </>
  );
}

// Спокойный открытый глаз: мягкая вертикальная капля + блик.
function OpenEye({ cx, cy, ink }: { cx: number; cy: number; ink: string }) {
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={3.6} ry={5.4} fill={ink} />
      <circle cx={cx - 1.2} cy={cy - 2.2} r={1.3} fill="#FFFFFF" fillOpacity="0.9" />
    </>
  );
}

// Глаз-дуга (улыбающийся / подмигивающий) — «‿».
function ArcEye({ cx, cy, ink }: { cx: number; cy: number; ink: string }) {
  return (
    <path
      d={`M${cx - 4.2} ${cy + 0.5} Q ${cx} ${cy - 4.5} ${cx + 4.2} ${cy + 0.5}`}
      stroke={ink}
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
    />
  );
}
