/**
 * Обёртка появления при скролле: контент проявляется (fade + сдвиг + blur),
 * когда попадает в область видимости. Используется по всему лендингу.
 */

"use client";

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
};

// Анимационные состояния: скрыто → видно.
// Только opacity + transform (без анимации filter: blur) — компоновка на GPU,
// плавно даже при появлении множества секций сразу.
const variants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

// Проявляет детей при первом появлении в вьюпорте (с задержкой delay).
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
  once = true,
}: Props) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "-80px" }}
      variants={variants}
      custom={y}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}
