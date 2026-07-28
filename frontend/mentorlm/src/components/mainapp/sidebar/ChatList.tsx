"use client";

/*
 * Список чатов сайдбара: группы по дате (ChatGroup), строка чата (ChatRow) с
 * контекстным меню и пункт меню (MenuItem). Поведение меню — в useChatRowMenu.
 */

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { modes, type ChatPreview } from "@/lib/mainapp-contents";
import { useChatRowMenu } from "./useChatRowMenu";

/** Подпись режима для строки чата в сайдбаре. */
const labelForMode = (id: ChatPreview["mode"]) =>
  modes.find((m) => m.id === id)?.label ?? id;

export type ChatRowActions = {
  activeId: string | null;
  onRename: (id: string, title: string) => void | Promise<void>;
  onTogglePin: (id: string, pinned: boolean) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

export function ChatGroup({
  label,
  chats,
  ...actions
}: { label: string; chats: ChatPreview[] } & ChatRowActions) {
  return (
    // Заголовок группы выровнен по тексту строк чатов (те же 12px внутри),
    // а не по краю списка — колонка названий читается одной вертикалью.
    <div className="mt-4 first:mt-2">
      <p className="px-3 pb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted">
        {label}
      </p>
      <ul className="flex flex-col gap-px">
        {chats.map((chat) => (
          <ChatRow key={chat.id} chat={chat} {...actions} />
        ))}
      </ul>
    </div>
  );
}

function ChatRow({
  chat,
  activeId,
  onRename,
  onTogglePin,
  onDelete,
}: { chat: ChatPreview } & ChatRowActions) {
  const { coords, open, btnRef, menuRef, close, toggle } = useChatRowMenu();
  const active = chat.id === activeId;

  const handleRename = () => {
    close();
    const next = window.prompt("Новое название чата", chat.title);
    if (next && next.trim() && next.trim() !== chat.title) {
      onRename(chat.id, next.trim());
    }
  };

  const handleDelete = () => {
    close();
    onDelete(chat.id);
  };

  return (
    <li>
      {/* Отступы строки: 12px слева до названия и столько же справа до иконки
          меню (6px поля + 6px внутри кнопки) — текст не липнет к скруглению. */}
      <div
        className={cn(
          "group flex items-center gap-2 rounded-xl py-2 pl-3 pr-1.5 text-[13.5px] transition-colors",
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
          className="flex min-w-0 flex-1 flex-col gap-1"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {chat.pinned && (
              <Pin
                className="h-3 w-3 shrink-0 -rotate-45 opacity-70"
                strokeWidth={2}
              />
            )}
            <span className="truncate font-medium leading-tight">{chat.title}</span>
          </span>
          <span className="truncate font-mono text-[10px] uppercase leading-none tracking-[0.14em] text-muted">
            {labelForMode(chat.mode)}
          </span>
        </Link>

        <button
          ref={btnRef}
          type="button"
          onClick={toggle}
          aria-label="Действия с чатом"
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_12%,transparent)] hover:text-ink",
            open || active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>

      {open &&
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
                close();
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
