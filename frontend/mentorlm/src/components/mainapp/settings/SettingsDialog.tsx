/*
 * Оболочка диалога настроек: модальное окно (backdrop, ESC, блокировка скролла),
 * навигация по вкладкам и маршрутизация к панелям. Содержимое и загрузку данных
 * каждая вкладка держит у себя — см. ./tabs и ./hooks.
 */

"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { TABS, type TabId } from "./config";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState<TabId>("general");

  // ESC закрывает
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // блокируем скролл body
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const ActivePanel = TABS.find((t) => t.id === tab)?.Panel;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4 backdrop-blur-sm"
        >
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Настройки"
            className="relative flex h-[620px] w-[860px] max-h-[92vh] max-w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_80px_-24px_rgba(7,27,77,0.4)]"
          >
            <aside className="flex w-[220px] shrink-0 flex-col border-r border-line bg-paper-2/40 p-3">
              <h2 className="px-2 pb-3 pt-1 text-[15px] font-semibold text-ink">
                Настройки
              </h2>
              <nav className="flex flex-col gap-0.5">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] transition-colors",
                        active
                          ? "bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"
                          : "text-ink-soft hover:bg-ink/[0.06] hover:text-ink"
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.7} />
                      {t.label}
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="relative flex-1 overflow-y-auto">
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
              >
                <X className="h-4 w-4" strokeWidth={1.7} />
              </button>

              <div className="px-7 py-6 pr-12">{ActivePanel && <ActivePanel />}</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
