/**
 * Секция «Возможности»: bento-сетка карточек режимов с абстрактными визуалами.
 * Заголовок + шесть карточек; у каждой свой мини-визуал (Visual0..5 ниже).
 */

import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { features } from "@/lib/landing-contents";

// Раскладка bento: размеры плиток по индексу карточки.
const bento = [
  "md:col-span-2 md:row-span-1",
  "md:col-span-1 md:row-span-1",
  "md:col-span-1 md:row-span-1",
  "md:col-span-2 md:row-span-1",
  "md:col-span-2 md:row-span-1",
  "md:col-span-1 md:row-span-1",
];

// Мини-визуалы карточек по индексу.
const visuals = [Visual0, Visual1, Visual2, Visual3, Visual4, Visual5];

// Секция «Возможности».
export function FeaturesSection() {
  return (
    <section id="features" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <header className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <Reveal>
            <p className="text-eyebrow">{features.eyebrow}</p>
            <h2 className="text-display mt-4 text-[clamp(2rem,4.6vw,3.6rem)] font-semibold text-ink">
              Всё для учёбы в{" "}
              <span className="font-editorial text-gradient">одном</span>{" "}
              окне.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-lg leading-relaxed text-muted lg:text-right">
              {features.description}
            </p>
          </Reveal>
        </header>

        {/* Bento-сетка карточек возможностей */}
        <div className="mt-14 grid auto-rows-[minmax(220px,auto)] grid-cols-1 gap-4 md:grid-cols-3">
          {features.items.map((item, i) => {
            const Visual = visuals[i] ?? Visual0;
            return (
              <Reveal key={item.title} delay={0.05 * (i + 1)} className={bento[i]}>
                <GlassCard
                  as="article"
                  className={cn(
                    "group relative flex h-full flex-col justify-between overflow-hidden p-6"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--brand-primary)]">
                      {item.tag}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)] opacity-50 transition-opacity duration-500 group-hover:opacity-100" />
                  </div>

                  <div className="my-6 min-h-[80px]">
                    <Visual />
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-ink">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                      {item.text}
                    </p>
                  </div>
                </GlassCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Абстрактные мини-визуалы карточек (лёгкие, в стиле бренда) ──

// Визуал «Общий чат»: пузырьки диалога.
function Visual0() {
  return (
    <div className="flex items-center gap-2">
      {[
        "Объясни тему простыми словами",
        "Конечно. Начнём с главного…",
      ].map((t, i) => (
        <div
          key={i}
          className={cn(
            "rounded-2xl border px-3 py-2 text-[12px]",
            i === 0
              ? "border-line bg-white/70 text-ink-soft"
              : "border-transparent bg-[var(--brand-primary)] text-white"
          )}
        >
          {t}
        </div>
      ))}
    </div>
  );
}

// Визуал «Код»: сниппет функции.
function Visual1() {
  return (
    <pre className="overflow-hidden rounded-xl border border-line bg-[#0B1226] p-3 font-mono text-[11px] leading-relaxed text-[var(--brand-blue-soft)]">
      <code>
        {"function "}
        <span className="text-[var(--brand-focus)]">solve</span>
        {"(n) {\n  "}
        <span className="text-[var(--brand-violet)]">return</span>
        {" n * (n + 1) / 2;\n}"}
      </code>
    </pre>
  );
}

// Визуал «Сценарии»: чипы-пресеты под задачу.
function Visual2() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {["Изучить", "Практика", "Ревью", "Источники"].map((s, i) => (
        <span
          key={s}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px]",
            i === 0
              ? "border-transparent bg-[var(--brand-primary)] text-white"
              : "border-line bg-white/70 text-ink-soft"
          )}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

// Визуал «Исследовать»: строка запроса и найденные источники.
function Visual3() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1.5">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M11 11l3 3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="font-mono text-[11px] text-muted">актуальные источники по теме</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["[1] arxiv.org", "[2] habr.com", "[3] cyberleninka"].map((s) => (
          <span
            key={s}
            className="rounded-md border border-line bg-white/70 px-2 py-0.5 font-mono text-[10px] text-[var(--brand-primary)]"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// Визуал «Память»: сохранённые факты о пользователе.
function Visual4() {
  return (
    <ul className="space-y-1.5">
      {[
        "Учится на 3 курсе прикладной математики",
        "Предпочитает короткие ответы с примерами",
      ].map((t) => (
        <li
          key={t}
          className="flex items-center gap-2 rounded-lg border border-line bg-white/70 px-2.5 py-1.5 text-[12px] text-ink-soft"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-violet)]" />
          {t}
        </li>
      ))}
    </ul>
  );
}

// Визуал «Вложения»: прикреплённые к сообщению файлы.
function Visual5() {
  return (
    <div className="space-y-1.5">
      {["Лекция_04.pdf", "Конспект.docx"].map((name) => (
        <div
          key={name}
          className="flex items-center gap-2 rounded-lg border border-line bg-white/70 px-2.5 py-1.5"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M9 2H4v12h8V5L9 2z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
              className="text-[var(--brand-primary)]"
            />
            <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" className="text-[var(--brand-primary)]" />
          </svg>
          <span className="font-mono text-[11px] text-muted">{name}</span>
        </div>
      ))}
    </div>
  );
}
