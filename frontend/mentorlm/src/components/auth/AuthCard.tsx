/**
 * Общая обвязка экранов входа и регистрации: брендовая шапка с маскотом,
 * стеклянная карточка формы, место под ошибку и ссылка на соседний экран.
 * Отличается у /sign-in и /sign-up только содержимым и выражением маскота.
 */

"use client";

import Link from "next/link";
import { Mascot } from "@/components/ui/Mascot";
import { GlassCard } from "@/components/ui/GlassCard";

type Props = {
  title: string;
  subtitle: string;
  /** Выражение маскота: вход — happy, регистрация — calm. */
  expression: "happy" | "calm";
  /** Общая ошибка формы (ответ бэкенда или несовпадение паролей). */
  error?: string | null;
  footerText: string;
  footerLink: { label: string; href: string };
  children: React.ReactNode;
};

export function AuthCard({
  title,
  subtitle,
  expression,
  error,
  footerText,
  footerLink,
  children,
}: Props) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      {/* Брендовая шапка: маскот-линза + словесная марка, ссылка на главную */}
      <Link href="/" className="flex flex-col items-center gap-3">
        <Mascot size={78} expression={expression} float="fly" />
        <span className="text-[17px] font-semibold tracking-tight text-ink">
          Mentor<span className="text-[var(--brand-primary)]">LM</span>
        </span>
      </Link>

      <GlassCard className="glass w-full max-w-[400px] p-7">
        {/* 600/450: заголовок — интерфейсный, подпись — читаемый текст */}
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1.5 text-[14px] text-ink-soft">{subtitle}</p>

        {error && (
          <p
            // role=alert: ошибка после отправки формы должна быть озвучена
            // скринридером, а не только показана.
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50/50 px-3.5 py-2.5 text-[13px] text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <div className="mt-5">{children}</div>
      </GlassCard>

      <p className="text-[14px] text-ink-soft">
        {footerText}{" "}
        <Link
          href={footerLink.href}
          className="font-medium text-[var(--brand-primary)] underline-offset-4 hover:underline"
        >
          {footerLink.label}
        </Link>
      </p>
    </main>
  );
}
