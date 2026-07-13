"use client";

/*
 * Мелкие презентационные части сайдбара: шапка, переключатель режимов, кнопка
 * нового чата, поиск и подвал. Никакого состояния — только вид и колбэки.
 */

import Link from "next/link";
import { motion } from "motion/react";
import {
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { modes } from "@/lib/mainapp-contents";

export function SidebarHeader({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 pt-3 pb-1">
      <Link
        href="/chat"
        aria-label="На главную"
        className="rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
      >
        <Logo />
      </Link>
      <button
        type="button"
        onClick={onCollapse}
        aria-label="Свернуть сайдбар"
        title="Свернуть сайдбар"
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink"
      >
        <PanelLeftClose className="h-4 w-4" strokeWidth={1.7} />
      </button>
    </div>
  );
}

export function ModeSwitcher({ pathname }: { pathname: string | null }) {
  return (
    <div className="px-3 pt-2">
      <div className="flex flex-col gap-0.5 rounded-2xl bg-[color-mix(in_srgb,var(--brand-ink)_6%,transparent)] p-1">
        {modes.map((mode) => {
          const active = pathname?.startsWith(mode.href);
          return (
            <Link
              key={mode.id}
              href={mode.href}
              className={cn(
                "relative flex h-9 items-center rounded-xl px-3 text-[13.5px] font-medium transition-colors",
                active
                  ? "text-white"
                  : "text-ink-soft hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink"
              )}
            >
              {active && (
                <motion.span
                  layoutId="mode-pill"
                  className="absolute inset-0 rounded-xl bg-[var(--brand-primary)] shadow-[0_8px_22px_-8px_rgba(23,70,245,0.6)]"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative">{mode.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function NewChatButton() {
  return (
    <Link
      href="/chat"
      className="group flex h-10 w-full items-center gap-2 rounded-2xl bg-[var(--brand-ink)] px-3 text-[14px] font-medium text-white transition-transform duration-300 ease-out hover:translate-y-[-1px] hover:bg-[var(--brand-ink-soft)]"
    >
      <Plus className="h-[14px] w-[14px]" strokeWidth={2} />
      Новый чат
      <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-white/55">
        ⌘K
      </span>
    </Link>
  );
}

export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-2 flex h-9 items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--brand-ink)_6%,transparent)] px-3">
      <Search className="h-[14px] w-[14px] text-muted" strokeWidth={1.7} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по чатам"
        className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
      />
    </div>
  );
}

export function SidebarFooter({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  return (
    <div className="p-3">
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-10 w-full items-center gap-2 rounded-2xl px-3 text-left text-[13.5px] text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink"
      >
        <Settings className="h-[14px] w-[14px]" strokeWidth={1.7} />
        Настройки
      </button>
      <Link
        href="/billing"
        className="mt-1 flex h-10 items-center justify-between gap-2 rounded-2xl bg-[var(--brand-primary-soft)] px-3 text-[13.5px] font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-soft)]/80"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-[14px] w-[14px]" strokeWidth={1.7} />
          Перейти на Pro
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--brand-primary)]/70">
          490₽
        </span>
      </Link>
    </div>
  );
}
