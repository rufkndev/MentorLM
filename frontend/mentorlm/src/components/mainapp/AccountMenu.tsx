/**
 * Меню аккаунта в правом верхнем углу приложения: аватар-инициал и выпадающее
 * меню с почтой, настройками и выходом. Заменяет виджет внешнего провайдера —
 * аккаунтом теперь управляем сами.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { LogOut, Settings } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

export function AccountMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Закрываем по клику вне и по Escape — обычное поведение поповера.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const initial = user.email.charAt(0).toUpperCase();

  const signOut = async () => {
    setOpen(false);
    await logout();
    router.replace("/");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Меню аккаунта"
        className="glass-strong grid h-10 w-10 place-items-center rounded-full text-[15px] font-semibold text-ink ring-1 ring-white/60 shadow-[0_8px_22px_-10px_rgba(7,27,77,0.25)] transition-colors"
      >
        {initial}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="glass-strong absolute right-0 top-12 w-60 overflow-hidden rounded-2xl p-1.5"
          >
            {/* Почта — сама по себе не действие, поэтому вне списка пунктов */}
            <div className="px-3 py-2">
              <p className="truncate text-[13px] font-medium text-ink" title={user.email}>
                {user.email}
              </p>
              <p className="mt-0.5 text-[12px] uppercase tracking-wide text-muted">
                Тариф: {user.plan}
              </p>
            </div>
            <div className="my-1 h-px bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)]" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_6%,transparent)] hover:text-ink"
            >
              <Settings className="h-4 w-4" strokeWidth={1.7} />
              Настройки
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.7} />
              Выйти
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
