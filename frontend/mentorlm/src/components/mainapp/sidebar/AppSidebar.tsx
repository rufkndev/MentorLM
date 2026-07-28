"use client";

/*
 * Оболочка сайдбара: анимированный контейнер, фильтр и группировка чатов,
 * оркестрация списка. Части вида — в ./parts, список чатов — в ./ChatList.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useConversations } from "@/components/mainapp/ConversationsProvider";
import {
  groupChatsByDate,
  type ChatPreview,
} from "@/lib/mainapp-contents";
import { ChatGroup } from "./ChatList";
import {
  ModeSwitcher,
  NewChatButton,
  SearchInput,
  SidebarFooter,
  SidebarHeader,
} from "./parts";

type Props = {
  open: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
};

export function AppSidebar({ open, onToggle, onOpenSettings }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");
  const { conversations, loading, rename, remove, togglePin } =
    useConversations();
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

            <nav className="thin-scroll mt-2 flex-1 overflow-y-auto px-3 pb-3">
              {grouped.length === 0 ? (
                // Пока идёт первая загрузка — молчим, чтобы не мигало «нет чатов».
                loading ? null : (
                  <p className="mt-6 text-center text-[13px] text-muted">
                    Чатов пока нет
                  </p>
                )
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
