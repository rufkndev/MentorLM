/**
 * Layout раздела оплаты (/billing и /billing/checkout).
 * Добавляет к страницам плавающую кнопку «Назад» поверх контента.
 */

"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Каркас страниц биллинга: кнопка «Назад» + контент.
export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  // Возврат назад по истории, иначе — в чат.
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/chat");
    }
  };

  return (
    <>
      {/* Плавающая кнопка «Назад» в левом верхнем углу */}
      <button
        type="button"
        onClick={handleBack}
        aria-label="Назад"
        className="glass-strong fixed left-6 top-6 z-30 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium text-ink-soft transition-all hover:translate-y-[-1px] hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
        Назад
      </button>
      <main className="min-h-screen">{children}</main>
    </>
  );
}
