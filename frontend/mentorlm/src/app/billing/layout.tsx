"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  /* Кнопка "Назад" */
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/chat");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleBack}
        aria-label="Назад"
        className="fixed left-6 top-6 z-30 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3.5 py-2 text-[13px] font-medium text-ink-soft ring-1 ring-line backdrop-blur-md transition-all hover:translate-y-[-1px] hover:bg-white hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
        Назад
      </button>
      <main className="min-h-screen">{children}</main>
    </>
  );
}
