/**
 * Пустой экран чата (когда диалог ещё не начат).
 * Показывает приветствие и подсказку. Рендерится в ChatScreen над hero-композером.
 */

"use client";

import { motion } from "motion/react";

// Приветственный блок пустого чата (заголовок + подпись).
export function ChatEmpty() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="text-display text-[clamp(1.8rem,4.4vw,2.6rem)] font-semibold text-ink"
      >
        С чем помочь сегодня?{" "}
        <span className="font-editorial text-gradient">учим</span> вместе.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="mt-4 max-w-lg text-[15px] font-medium leading-relaxed text-ink-soft"
      >
        Задайте вопрос, прикрепите материалы или выберите подсказку ниже.
      </motion.p>
    </div>
  );
}
