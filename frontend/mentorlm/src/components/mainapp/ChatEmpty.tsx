"use client";

import { motion } from "motion/react";
import { promptSuggestions } from "@/lib/mainapp-contents";

type Props = {
  greeting?: string;
};

export function ChatEmpty({ greeting }: Props) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="text-display text-[clamp(1.8rem,4.4vw,2.6rem)] font-semibold text-ink"
      >
        {greeting ?? "С чем помочь сегодня?"}{" "}
        <span className="font-editorial text-gradient">учим</span> вместе.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="mt-4 text-[15px] text-ink-soft"
      >
        Задайте вопрос, прикрепите материалы или выберите подсказку ниже.
      </motion.p>
    </div>
  );
}

export function PromptSuggestions({
  onPick,
}: {
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-1.5">
      {promptSuggestions.map((p, i) => (
        <motion.button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            delay: 0.25 + i * 0.05,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="rounded-full bg-[color-mix(in_srgb,var(--brand-ink)_6%,transparent)] px-3.5 py-2 text-[13px] text-ink-soft transition-all hover:-translate-y-px hover:bg-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] hover:text-ink"
        >
          {p}
        </motion.button>
      ))}
    </div>
  );
}
