/**
 * Секция «Вопросы и ответы».
 * Заголовок в общем стиле секций + аккордеон: открыт один пункт за раз.
 * Контент — из landing-contents (faq).
 */

"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { faq } from "@/lib/landing-contents";

// Секция «Вопросы и ответы».
export function FAQSection() {
  // Индекс раскрытого вопроса; null — все свёрнуты.
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <header className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <Reveal>
            <p className="text-eyebrow">{faq.eyebrow}</p>
            <h2 className="text-display mt-4 text-[clamp(2rem,4.6vw,3.6rem)] font-semibold text-ink">
              Вопросы, которые возникают{" "}
              <span className="font-editorial text-gradient">первыми</span>.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-lg leading-relaxed text-muted lg:text-right">
              {faq.description}
            </p>
          </Reveal>
        </header>

        {/* Аккордеон вопросов */}
        <div className="mt-14 flex flex-col gap-3">
          {faq.items.map((item, i) => (
            <Reveal key={item.q} delay={0.04 * (i + 1)}>
              <FaqItem
                item={item}
                index={i}
                total={faq.items.length}
                open={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
              />
            </Reveal>
          ))}
        </div>

        {/* Ссылка на контакты для всего остального */}
        <Reveal delay={0.1} className="mt-10">
          <p className="text-center text-[15px] text-muted">
            {faq.footnote}{" "}
            <Link
              href={faq.footnoteLink.href}
              className="font-medium text-[var(--brand-primary)] underline-offset-4 transition-opacity hover:opacity-70 hover:underline"
            >
              {faq.footnoteLink.label}
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// Один вопрос аккордеона: кнопка-заголовок и раскрывающийся ответ.
function FaqItem({
  item,
  index,
  total,
  open,
  onToggle,
}: {
  item: { q: string; a: string };
  index: number;
  total: number;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `faq-panel-${index}`;

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-4 p-6 text-left sm:gap-6 sm:p-7"
      >
        <span className="mt-1 hidden w-16 shrink-0 font-mono text-[11px] uppercase tracking-widest text-muted sm:block">
          0{index + 1} / 0{total}
        </span>
        <h3 className="flex-1 text-lg font-semibold tracking-tight text-ink">
          {item.q}
        </h3>
        {/* Плюс, превращающийся в минус при раскрытии */}
        <span
          aria-hidden
          className="relative mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line"
        >
          <span className="block h-px w-2.5 bg-[var(--brand-primary)]" />
          <span
            className={cn(
              "absolute block h-2.5 w-px bg-[var(--brand-primary)] transition-transform duration-300",
              open ? "scale-y-0" : "scale-y-100"
            )}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {/* Пустая колонка повторяет нумерацию, чтобы ответ встал под вопросом */}
            <div className="flex gap-4 px-6 pb-6 sm:gap-6 sm:px-7 sm:pb-7">
              <span aria-hidden className="hidden w-16 shrink-0 sm:block" />
              <p className="flex-1 text-[15px] leading-relaxed text-ink-soft">
                {item.a}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
