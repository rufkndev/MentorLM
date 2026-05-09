import type { ReactNode } from "react";

interface DocPageProps {
  eyebrow?: string;
  title: string;
  description?: string;
  updatedAt?: string;
  children: ReactNode;
}

export function DocPage({
  eyebrow,
  title,
  description,
  updatedAt,
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
        <header className="mb-12">
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
        </header>
        <div className="doc-prose">{children}</div>
      </div>
    </section>
  );
}
