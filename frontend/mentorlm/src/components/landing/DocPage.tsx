/**
 * Обёртка для текстовых страниц (о проекте, блог, контакты, юридические).
 * Даёт единый заголовок (eyebrow/title/description/дата) и типографику контента.
 */

import type { ReactNode } from "react";
import { Mascot, type MascotExpression } from "@/components/ui/Mascot";

interface DocPageProps {
  eyebrow?: string;
  title: string;
  description?: string;
  updatedAt?: string;
  /** Показать маскота-компаньона сбоку от шапки (для about/contacts/blog). */
  showMascot?: boolean;
  /** Выражение лица маскота — чтобы поза отличалась между страницами. */
  mascotExpression?: MascotExpression;
  children: ReactNode;
}

// Шаблон документной страницы: шапка + область текста (children).
export function DocPage({
  eyebrow,
  title,
  description,
  updatedAt,
  showMascot,
  mascotExpression = "curious",
  children,
}: DocPageProps) {
  return (
    <section className="relative pt-32 pb-24">
      <div className="aurora opacity-40" aria-hidden />
      <div
        className="absolute inset-0 grid-paper opacity-[0.18]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-6">
        {/* Шапка документа: рубрика, заголовок, описание, дата */}
        <header className="mb-12 flex items-start justify-between gap-8">
          <div className="min-w-0">
            {eyebrow ? <p className="text-eyebrow">{eyebrow}</p> : null}
            <h1 className="mt-4 text-[clamp(2rem,4.6vw,3.4rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-ink">
              {title}
            </h1>
            {description ? (
              <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-soft">
                {description}
              </p>
            ) : null}
            {updatedAt ? (
              <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                обновлено · {updatedAt}
              </p>
            ) : null}
          </div>
          {/* Маскот сбоку от заголовка — смотрит на текст (flip) */}
          {showMascot ? (
            <Mascot
              size={104}
              expression={mascotExpression}
              float="fly"
              flip
              className="hidden shrink-0 lg:inline-flex"
            />
          ) : null}
        </header>
        {/* Текстовое содержимое конкретной страницы */}
        <div className="doc-prose">{children}</div>
      </div>
    </section>
  );
}
