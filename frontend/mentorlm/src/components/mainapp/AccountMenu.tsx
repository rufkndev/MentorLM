/**
 * Личный кабинет в правом верхнем углу приложения: аватар и выпадающая карточка
 * с тарифом, остатком лимитов и переходами в разделы настроек.
 *
 * Это не просто «меню с выходом». Здесь человек чаще всего оказывается, когда
 * хочет понять «сколько у меня осталось» и «что у меня за тариф», поэтому в
 * шапке карточки сразу видны план и ближайшее к исчерпанию окно квоты — иначе
 * за этими двумя цифрами пришлось бы открывать диалог настроек.
 *
 * Тариф берётся из SubscriptionProvider, а не из user.plan: профиль сессии
 * обновляется только при перевыпуске токена и сразу после оплаты показывал бы
 * старый план.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  CreditCard,
  LogOut,
  Receipt,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSubscription } from "@/components/mainapp/SubscriptionProvider";
import type { TabId } from "@/components/mainapp/settings/config";
import { cn } from "@/lib/cn";

// Пункт меню: иконка + подпись, одинаковая геометрия у кнопок и ссылок.
const ITEM_CLASS =
  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] " +
  "font-medium text-ink-soft transition-colors " +
  "hover:bg-[color-mix(in_srgb,var(--brand-ink)_6%,transparent)] hover:text-ink";

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={ITEM_CLASS}>
      <Icon className="h-4 w-4 flex-none text-muted" strokeWidth={1.7} />
      {label}
    </button>
  );
}

// Цвет остатка — тот же порог, что во вкладке «Подписка»: спокойный, пока
// запас есть, и заметный, когда он кончается.
function toneFor(remaining: number): string {
  if (remaining <= 10) return "#d4334a";
  if (remaining <= 25) return "#e08a1e";
  return "var(--brand-primary)";
}

export function AccountMenu({
  onOpenSettings,
}: {
  onOpenSettings: (tab?: TabId) => void;
}) {
  const { user, logout } = useAuth();
  const { sub, usage, plan, isPaid } = useSubscription();
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

  // Самое забитое окно по всем режимам: именно оно упрётся первым, и именно
  // его имеет смысл показать одной строкой вместо шести шкал.
  const tightest = useMemo(() => {
    if (!usage) return null;
    return Object.values(usage.modes).reduce(
      (worst, mode) => (mode.remaining_pct < worst.remaining_pct ? mode : worst),
      Object.values(usage.modes)[0],
    );
  }, [usage]);

  if (!user) return null;

  const planLabel = sub?.plan_label ?? user.plan ?? "";
  const initial = user.email.charAt(0).toUpperCase();

  const signOut = async () => {
    setOpen(false);
    await logout();
    router.replace("/");
  };

  const go = (tab: TabId) => {
    setOpen(false);
    onOpenSettings(tab);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Личный кабинет"
        className={cn(
          "glass-strong grid h-10 w-10 place-items-center rounded-full text-[15px]",
          "font-semibold text-ink ring-1 ring-white/60 transition-all duration-200",
          "shadow-[0_8px_22px_-10px_rgba(7,27,77,0.25)]",
          "hover:shadow-[0_10px_26px_-10px_rgba(7,27,77,0.35)]",
          open && "ring-[var(--brand-primary)]/40",
        )}
      >
        {initial}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong absolute right-0 top-12 w-[280px] overflow-hidden rounded-[var(--radius-lg)] p-1.5"
          >
            {/* ── Шапка: кто вошёл и на каком тарифе ─────────────────────── */}
            <div className="flex items-center gap-3 px-2.5 pb-3 pt-2.5">
              <span
                aria-hidden
                className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--brand-primary)] text-[14px] font-semibold text-white"
              >
                {initial}
              </span>
              <div className="min-w-0">
                <p
                  className="truncate text-[13.5px] font-medium text-ink"
                  title={user.email}
                >
                  {user.email}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      isPaid ? "bg-[var(--brand-primary)]" : "bg-[var(--brand-muted)]",
                    )}
                    aria-hidden
                  />
                  Тариф {planLabel}
                </p>
              </div>
            </div>

            {/* ── Остаток лимитов: самое забитое окно ────────────────────── */}
            {tightest && (
              <div className="mx-1 mb-1.5 rounded-2xl border border-line bg-surface/60 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px] text-muted">
                    {tightest.label} · за {tightest.window_label}
                  </span>
                  <span className="flex-none text-[12px] font-medium text-ink">
                    {tightest.remaining_pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--brand-ink)_9%,transparent)]">
                  <div
                    className="h-full rounded-full transition-[width,background-color] duration-700 ease-out"
                    style={{
                      width: `${Math.max(2, tightest.remaining_pct)}%`,
                      background: toneFor(tightest.remaining_pct),
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── Апселл: только тем, кому есть куда расти ───────────────── */}
            {plan === "free" && (
              <Link
                href="/billing"
                onClick={() => setOpen(false)}
                className="mx-1 mb-1.5 flex items-center justify-between gap-2 rounded-2xl bg-[var(--brand-primary-soft)] px-3 py-2.5 text-[13px] font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-soft)]/70"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 flex-none" strokeWidth={1.7} />
                  Больше лимитов и моделей
                </span>
              </Link>
            )}

            <div className="mx-2 my-1 h-px bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)]" />

            {/* ── Разделы. Ведут сразу на нужную вкладку настроек ────────── */}
            <MenuItem icon={Settings} label="Настройки" onClick={() => go("general")} />
            <MenuItem
              icon={CreditCard}
              label="Подписка и лимиты"
              onClick={() => go("subscription")}
            />
            <MenuItem icon={Receipt} label="Платежи" onClick={() => go("payments")} />

            <div className="mx-2 my-1 h-px bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)]" />

            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] font-medium text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4 flex-none" strokeWidth={1.7} />
              Выйти
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
