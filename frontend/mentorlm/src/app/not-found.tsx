/**
 * Страница 404 (не найдено) — маркетинговое оформление с маскотом-линзой.
 * Применяется ко всем ненайденным маршрутам приложения.
 */

import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/ui/Mascot";

export const metadata: Metadata = {
  title: "Страница не найдена",
};

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
      <div className="aurora opacity-50" aria-hidden />
      <div className="absolute inset-0 grid-paper opacity-[0.18]" aria-hidden />

      <div className="relative flex flex-col items-center">
        <Mascot size={124} expression="thinking" float="fly" tilt={-4} />

        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.24em] text-muted">
          ошибка 404
        </p>
        <h1 className="mt-3 text-[clamp(2rem,5vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-ink">
          Такой страницы нет
        </h1>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-soft">
          Возможно, ссылка устарела или страница переехала. Вернитесь на главную
          и продолжите с рабочего пространства.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button href="/" size="lg">
            На главную
          </Button>
          <Button href="/chat" variant="glass" size="lg">
            Открыть Mentor LM
          </Button>
        </div>
      </div>
    </main>
  );
}
