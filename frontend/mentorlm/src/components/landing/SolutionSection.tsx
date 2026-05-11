"use client";

import { Reveal } from "@/components/ui/Reveal";
import { solution } from "@/lib/landing-contents";

export function SolutionSection() {
  return (
    <section className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="text-eyebrow">{solution.eyebrow}</p>
            <h2 className="text-display mt-4 text-[clamp(2rem,4.6vw,3.6rem)] font-semibold text-ink">
              Единое пространство, которое{" "}
              <span className="font-editorial text-gradient">понимает</span>{" "}
              ваш контекст.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              {solution.description}
            </p>

            <dl className="mt-10 grid grid-cols-3 gap-3">
              {solution.highlights.map((h, i) => (
                <Reveal key={h.label} delay={0.06 * (i + 1)}>
                  <div className="rounded-2xl border border-line bg-paper-2/70 p-4 backdrop-blur">
                    <dt className="text-eyebrow">{h.label}</dt>
                    <dd className="mt-2 text-base font-medium text-ink">
                      {h.value}
                    </dd>
                  </div>
                </Reveal>
              ))}
            </dl>
          </Reveal>

          <Reveal delay={0.15}>
            <SolutionVideoSlot />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * SolutionVideoSlot — заглушка под видео-демо мейн-аппа.
 *
 * Пока вместо видео — стеклянная карточка с рамкой-градиентом и
 * подсказкой. Чтобы вставить ролик: положи файл в /public/video/
 * (например, mainapp.mp4 + mainapp.webm) и замени блок-placeholder
 * на тег <video> ниже — пример раскомментирован в коде.
 * ──────────────────────────────────────────────────────────────── */

function SolutionVideoSlot() {
  return (
    <div className="relative aspect-video w-full justify-self-center lg:justify-self-end">
      <div
        aria-hidden
        className="absolute inset-0 rounded-[28px]"
        style={{
          background:
            "radial-gradient(120% 80% at 15% 10%, var(--brand-blue-soft) 0%, transparent 55%), radial-gradient(120% 80% at 95% 95%, rgba(123,97,255,0.45) 0%, transparent 55%), linear-gradient(180deg, var(--brand-paper-2), var(--brand-paper))",
        }}
      />

      <div className="glass-strong absolute inset-3 flex items-center justify-center overflow-hidden rounded-[22px]">
        {/* ───── когда видео будет готово, замени блок ниже на:
        <video
          src="/video/mainapp.mp4"
          poster="/video/mainapp-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          className="h-full w-full object-cover"
        />
        ───── */}
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/70 text-[var(--brand-primary)]">
            <PlayIcon />
          </span>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            демо · скоро
          </p>
          <p className="max-w-[260px] text-[13px] leading-relaxed text-ink-soft">
            Здесь будет короткое видео работы с Mentor LM.
          </p>
        </div>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5 3.5l7 4.5-7 4.5v-9z"
        fill="currentColor"
      />
    </svg>
  );
}
