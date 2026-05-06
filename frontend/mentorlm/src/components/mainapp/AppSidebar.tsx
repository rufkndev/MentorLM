"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import {
  groupChatsByDate,
  mockChats,
  modes,
  type ChatPreview,
} from "@/lib/mainapp-contents";

type Props = {
  open: boolean;
};

export function AppSidebar({ open }: Props) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const filtered = useMemo<readonly ChatPreview[]>(() => {
    if (!query.trim()) return mockChats;
    const q = query.toLowerCase();
    return mockChats.filter((c) => c.title.toLowerCase().includes(q));
  }, [query]);

  const grouped = useMemo(() => groupChatsByDate(filtered), [filtered]);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 288, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-30 shrink-0 overflow-hidden"
        >
          <div className="sticky top-3 ml-3 flex h-[calc(100vh-1.5rem)] w-72 flex-col rounded-3xl glass-strong">
            <ModeSwitcher pathname={pathname} />

            <div className="px-3 pt-2">
              <NewChatButton />
              <SearchInput value={query} onChange={setQuery} />
            </div>

            <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:thin]">
              {grouped.length === 0 ? (
                <p className="mt-6 text-center text-[13px] text-muted">
                  Чатов пока нет
                </p>
              ) : (
                grouped.map(([label, chats]) => (
                  <ChatGroup key={label} label={label} chats={chats} />
                ))
              )}
            </nav>

            <SidebarFooter />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function ModeSwitcher({ pathname }: { pathname: string | null }) {
  return (
    <div className="px-3 pt-3">
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/45 p-1">
        {modes.map((mode) => {
          const active = pathname?.startsWith(mode.href);
          return (
            <Link
              key={mode.id}
              href={mode.href}
              className={cn(
                "relative grid place-items-center rounded-xl px-2 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "text-white"
                  : "text-ink-soft hover:bg-white/60 hover:text-ink"
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

function NewChatButton() {
  return (
    <Link
      href="/chat"
      className="group flex h-10 w-full items-center gap-2 rounded-2xl bg-[var(--brand-ink)] px-3 text-[14px] font-medium text-white transition-transform duration-300 ease-out hover:translate-y-[-1px] hover:bg-[var(--brand-ink-soft)]"
    >
      <PlusIcon />
      Новый чат
      <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-white/55">
        ⌘K
      </span>
    </Link>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-2 flex h-9 items-center gap-2 rounded-xl bg-white/55 px-3">
      <SearchIcon />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по чатам"
        className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
      />
    </div>
  );
}

function ChatGroup({
  label,
  chats,
}: {
  label: string;
  chats: ChatPreview[];
}) {
  return (
    <div className="mt-4 first:mt-2">
      <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-muted">
        {label}
      </p>
      <ul>
        {chats.map((chat) => (
          <li key={chat.id}>
            <Link
              href={`/chat?c=${chat.id}`}
              className="flex h-9 items-center gap-2 rounded-xl px-2 text-[13.5px] text-ink-soft transition-colors hover:bg-white/60 hover:text-ink"
            >
              <span className="truncate">{chat.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-white/40 p-3">
      <Link
        href="/settings"
        className="flex h-10 items-center gap-2 rounded-2xl px-3 text-[13.5px] text-ink-soft transition-colors hover:bg-white/55 hover:text-ink"
      >
        <SettingsIcon />
        Настройки
      </Link>
      <Link
        href="/billing"
        className="mt-1 flex h-10 items-center justify-between gap-2 rounded-2xl bg-[var(--brand-primary-soft)] px-3 text-[13.5px] font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-soft)]/80"
      >
        <span className="flex items-center gap-2">
          <SparkleIcon />
          Перейти на Pro
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--brand-primary)]/70">
          490₽
        </span>
      </Link>
    </div>
  );
}

/* — icons — */

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M11 11l3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5l1.4 4.1 4.1 1.4-4.1 1.4-1.4 4.1-1.4-4.1-4.1-1.4 4.1-1.4L8 1.5z"
        fill="currentColor"
      />
    </svg>
  );
}
