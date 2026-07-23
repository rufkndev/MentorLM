/**
 * Секция «Решение» лендинга.
 * Слева — заголовок, описание и три метрики; справа — статичный превью
 * интерфейса приложения (готовый, без внешних ассетов и заглушек).
 */

"use client";

import { Reveal } from "@/components/ui/Reveal";
import { solution } from "@/lib/landing-contents";

// Секция «Решение».
export function SolutionSection() {
  return (
    <section className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          {/* Левая колонка: текст и метрики */}
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

            {/* Три ключевые метрики решения */}
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

          {/* Правая колонка: статичный превью интерфейса приложения */}
          <Reveal delay={0.15}>
            <SolutionAppPreview />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// Готовый статичный превью рабочего окна Mentor LM: переключатель режимов,
// сообщение пользователя, чипы сценариев и начало ответа модели. Полностью на
// CSS/разметке — без внешних ассетов, ничего не нужно дорабатывать.
function SolutionAppPreview() {
  return (
    // Карточка задаёт высоту (по контенту); свечение — ровный слой позади неё,
    // так фон и карточка всегда совпадают по размеру со всех сторон.
    <div className="relative w-full max-w-[520px] justify-self-center lg:justify-self-end">
      {/* Мягкое цветное свечение под карточкой (равномерно выходит за края) */}
      <div
        aria-hidden
        className="absolute -inset-4 rounded-[32px]"
        style={{
          background:
            "radial-gradient(120% 80% at 15% 10%, var(--brand-blue-soft) 0%, transparent 55%), radial-gradient(120% 80% at 95% 95%, rgba(123,97,255,0.45) 0%, transparent 55%), linear-gradient(180deg, var(--brand-paper-2), var(--brand-paper))",
        }}
      />

      <div className="glass-strong relative flex flex-col overflow-hidden rounded-[24px]">
        {/* Верхняя панель: точки окна и переключатель режимов */}
        <div className="flex items-center gap-3 border-b border-line/70 px-4 py-3">
          <span className="flex gap-1.5">
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span
                key={c}
                className="h-2.5 w-2.5 rounded-full opacity-70"
                style={{ background: c }}
              />
            ))}
          </span>
          <div className="ml-1 flex items-center gap-1">
            {["Общий", "Код", "Исследовать"].map((m, i) => (
              <span
                key={m}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  i === 0
                    ? "bg-[var(--brand-primary)] text-white"
                    : "text-muted"
                }`}
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* Область диалога */}
        <div className="flex flex-1 flex-col gap-3 px-4 py-4">
          {/* Сообщение пользователя */}
          <div className="self-end rounded-2xl rounded-br-sm bg-[var(--brand-primary)] px-3.5 py-2 text-[12px] text-white shadow-sm">
            Помоги разобраться с темой по загруженной лекции
          </div>

          {/* Ответ модели */}
          <div className="max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-line bg-white/70 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-soft">
            <p>Конечно. Разберём по шагам, опираясь на ваш конспект:</p>
            <div className="mt-2 space-y-1.5">
              {[92, 78, 64].map((w, i) => (
                <span
                  key={i}
                  className="block h-1.5 rounded-full bg-[var(--brand-line)]"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Нижняя панель: чипы сценариев и поле ввода */}
        <div className="border-t border-line/70 px-4 py-3">
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {["Изучить", "Практическая работа", "Текст"].map((s, i) => (
              <span
                key={s}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  i === 0
                    ? "border-transparent bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                    : "border-line bg-white/60 text-muted"
                }`}
              >
                {s}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-white/70 px-3.5 py-2">
            <span className="flex-1 text-[12px] text-muted">
              Спросите что угодно по учёбе…
            </span>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--brand-primary)] text-white">
              <ArrowUpIcon />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Иконка-стрелка «отправить» для поля ввода превью.
function ArrowUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 13V4m0 0L4 8m4-4 4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
