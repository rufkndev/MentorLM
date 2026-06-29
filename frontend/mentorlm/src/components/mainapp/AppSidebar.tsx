"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useConversations } from "@/components/mainapp/ConversationsProvider";
import { cn } from "@/lib/cn";
import {
  groupChatsByDate,
  modes,
  type ChatPreview,
} from "@/lib/mainapp-contents";

type Props = {
  open: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
};

/** Подпись режима для строки чата в сайдбаре. */
const labelForMode = (id: ChatPreview["mode"]) =>
  modes.find((m) => m.id === id)?.label ?? id;

export function AppSidebar({ open, onToggle, onOpenSettings }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");
  const { conversations, rename, remove, togglePin } = useConversations();
  const [query, setQuery] = useState("");

  const filtered = useMemo<readonly ChatPreview[]>(() => {
    if (!query.trim()) return conversations;
    const q = query.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [query, conversations]);

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
          {/* Фон — через .glass-strong (у класса есть тёмный вариант), без
              хардкода белого, иначе сайдбар оставался бы белым в тёмной теме. */}
          <div className="sticky top-3 ml-3 flex h-[calc(100vh-1.5rem)] w-72 flex-col rounded-3xl glass-strong">
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
                  <ChatGroup
                    key={label}
                    label={label}
                    chats={chats}
                    activeId={activeId}
                    onRename={rename}
                    onTogglePin={togglePin}
                    onDelete={async (id) => {
                      await remove(id);
                      if (id === activeId) router.replace("/chat");
                    }}
                  />
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
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink"
      >
        <PanelLeftClose className="h-4 w-4" strokeWidth={1.7} />
      </button>
    </div>
  );
}

function ModeSwitcher({ pathname }: { pathname: string | null }) {
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

type ChatRowActions = {
  activeId: string | null;
  onRename: (id: string, title: string) => void | Promise<void>;
  onTogglePin: (id: string, pinned: boolean) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

function ChatGroup({
  label,
  chats,
  ...actions
}: { label: string; chats: ChatPreview[] } & ChatRowActions) {
  return (
    <div className="mt-4 first:mt-2">
      <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-muted">
        {label}
      </p>
      <ul>
        {chats.map((chat) => (
          <ChatRow key={chat.id} chat={chat} {...actions} />
        ))}
      </ul>
    </div>
  );
}

const MENU_WIDTH = 176; // w-44
const MENU_HEIGHT = 132; // 3 пункта ≈ высота меню

function ChatRow({
  chat,
  activeId,
  onRename,
  onTogglePin,
  onDelete,
}: { chat: ChatPreview } & ChatRowActions) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = chat.id === activeId;
  const menuOpen = coords !== null;

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Меню — fixed-портал у кнопки: не клиппится скроллом и не двигает чаты.
    let top = r.bottom + 4;
    if (top + MENU_HEIGHT > window.innerHeight) top = r.top - MENU_HEIGHT - 4;
    const left = Math.max(8, r.right - MENU_WIDTH);
    setCoords({ top, left });
  };

  // Закрываем по клику вне меню/кнопки, при скролле и ресайзе.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setCoords(null);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuOpen]);

  const handleRename = () => {
    setCoords(null);
    const next = window.prompt("Новое название чата", chat.title);
    if (next && next.trim() && next.trim() !== chat.title) {
      onRename(chat.id, next.trim());
    }
  };

  const handleDelete = () => {
    setCoords(null);
    onDelete(chat.id);
  };

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-xl py-1.5 pl-2 pr-1 text-[13.5px] transition-colors",
          active
            ? "bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"
            : "text-ink-soft hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink",
        )}
      >
        {/* Переход в чат его собственного режима (чаты всех режимов в одном
            списке). prefetch — мгновенный переход без подгрузки маршрута. */}
        <Link
          href={`/${chat.mode}?c=${chat.id}`}
          prefetch
          className="flex min-w-0 flex-1 flex-col gap-0.5"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {chat.pinned && (
              <Pin
                className="h-3 w-3 shrink-0 -rotate-45 opacity-70"
                strokeWidth={2}
              />
            )}
            <span className="truncate">{chat.title}</span>
          </span>
          <span className="truncate font-mono text-[9.5px] uppercase tracking-wider text-muted">
            {labelForMode(chat.mode)}
          </span>
        </Link>

        <button
          ref={btnRef}
          type="button"
          onClick={() => (menuOpen ? setCoords(null) : openMenu())}
          aria-label="Действия с чатом"
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] hover:text-ink",
            menuOpen || active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>

      {menuOpen &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: coords.top, left: coords.left }}
            className="z-[100] w-44 overflow-hidden rounded-xl glass-strong p-1 shadow-[0_18px_40px_-16px_rgba(9,15,31,0.35)]"
          >
            <MenuItem
              icon={Pencil}
              label="Переименовать"
              onClick={handleRename}
            />
            <MenuItem
              icon={chat.pinned ? PinOff : Pin}
              label={chat.pinned ? "Открепить" : "Закрепить"}
              onClick={() => {
                setCoords(null);
                onTogglePin(chat.id, !chat.pinned);
              }}
            />
            <MenuItem
              icon={Trash2}
              label="Удалить"
              onClick={handleDelete}
              danger
            />
          </div>,
          document.body,
        )}
    </li>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
        danger
          ? "text-[#d4334a] hover:bg-[color-mix(in_srgb,#d4334a_12%,transparent)]"
          : "text-ink-soft hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
      {label}
    </button>
  );
}

function SidebarFooter({ onOpenSettings }: { onOpenSettings: () => void }) {
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

