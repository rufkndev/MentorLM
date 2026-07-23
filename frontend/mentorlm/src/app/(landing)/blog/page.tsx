/**
 * Страница «Блог» (/blog) — листинг статей.
 * Данные берутся из src/lib/blog-contents.ts: карточки рисуются по массиву
 * `sortedPosts`. Пока статей нет — показывается аккуратное состояние-анонс.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { formatPostDate, sortedPosts } from "@/lib/blog-contents";

// SEO-метаданные страницы.
export const metadata: Metadata = {
  title: "Блог",
  description:
    "Блог Mentor LM: гайды по учёбе с AI, разборы возможностей платформы и обновления продукта.",
};

// Контент страницы «Блог».
export default function BlogPage() {
  const posts = sortedPosts;

  return (
    <section className="relative pt-32 pb-24">
      <div className="aurora opacity-40" aria-hidden />
      <div className="absolute inset-0 grid-paper opacity-[0.18]" aria-hidden />

      <div className="relative mx-auto max-w-4xl px-6">
        {/* Шапка раздела */}
        <header className="mb-12">
          <p className="text-eyebrow">Блог</p>
          <h1 className="mt-4 text-[clamp(2rem,4.6vw,3.4rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-ink">
            Материалы Mentor LM
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-soft">
            Гайды о том, как использовать AI для учёбы по делу, разборы режимов
            платформы, практические сценарии и обновления продукта.
          </p>
        </header>

        {/* Список статей или состояние-анонс */}
        {posts.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {posts.map((post, i) => (
              <Reveal key={post.slug} delay={0.05 * (i + 1)}>
                <Link href={`/blog/${post.slug}`} className="block h-full">
                  <GlassCard
                    as="article"
                    className="group flex h-full flex-col p-6 lift"
                  >
                    <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                      <span className="text-[var(--brand-primary)]">
                        {post.tag}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{formatPostDate(post.date)}</span>
                    </div>
                    <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink">
                      {post.title}
                    </h2>
                    <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-soft">
                      {post.excerpt}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-primary)]">
                      Читать
                      <span className="transition-transform duration-300 group-hover:translate-x-0.5">
                        →
                      </span>
                    </span>
                  </GlassCard>
                </Link>
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </section>
  );
}

// Состояние-анонс: показывается, пока в blog-contents.ts нет статей.
function EmptyState() {
  return (
    <div className="glass-card flex flex-col items-center gap-4 px-6 py-16 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        скоро
      </p>
      <h2 className="max-w-md text-2xl font-semibold text-ink">
        Готовим первые материалы
      </h2>
      <p className="max-w-md text-[15px] leading-relaxed text-ink-soft">
        Скоро здесь появятся гайды по учёбе с AI, разборы режимов Mentor LM и
        обновления продукта. Напишите на{" "}
        <a
          href="mailto:hello@mentorlm.ru"
          className="text-[var(--brand-primary)] underline underline-offset-2"
        >
          hello@mentorlm.ru
        </a>{" "}
        с темой «Блог», чтобы получить первые статьи первыми.
      </p>
    </div>
  );
}
