"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import {
  groupChatsByDate,
  modes,
  recentChats,
  type ChatPreview,
} from "@/lib/mainapp-contents";

type Props = {
  open: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
};

export function AppSidebar({ open, onToggle, onOpenSettings }: Props) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const filtered = useMemo<readonly ChatPreview[]>(() => {
    if (!query.trim()) return recentChats;
    const q = query.toLowerCase();
    return recentChats.filter((c) => c.title.toLowerCase().includes(q));
  }, [query]);

  const grouped = useMemo(() => groupChatsByDate(filtered), [filtered]);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 300, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-30 shrink-0 overflow-hidden"
        >
          <div
            className="sticky top-3 ml-3 flex h-[calc(100vh-1.5rem)] w-72 flex-col rounded-3xl glass-strong"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.78) 100%)",
              boxShadow:
                "var(--glass-rim), 0 1px 2px rgba(9,15,31,0.04)",
            }}
          >
            <SidebarHeader onCollapse={onToggle} />
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

            <SidebarFooter onOpenSettings={onOpenSettings} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function SidebarHeader({ onCollapse }: { onCollapse: () => void }) {
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
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-white/60 hover:text-ink"
      >
        <PanelLeftClose className="h-4 w-4" strokeWidth={1.7} />
      </button>
    </div>
  );
}

function ModeSwitcher({ pathname }: { pathname: string | null }) {
  return (
    <div className="px-3 pt-2">
      <div className="flex flex-col gap-0.5 rounded-2xl bg-white/45 p-1">
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
      <Plus className="h-[14px] w-[14px]" strokeWidth={2} />
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

function SidebarFooter({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="p-3">
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-10 w-full items-center gap-2 rounded-2xl px-3 text-left text-[13.5px] text-ink-soft transition-colors hover:bg-white/55 hover:text-ink"
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

