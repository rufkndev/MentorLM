"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useApi } from "@/lib/api";
import {
  dropMessages,
  loadConversationList,
  saveConversationList,
} from "@/lib/chat-cache";
import { type ChatPreview, type ModeId } from "@/lib/mainapp-contents";

/** Ответ бэка по диалогу (см. ConversationSerializer). */
type ApiConversation = {
  id: number;
  mode: ModeId;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

function toPreview(c: ApiConversation): ChatPreview {
  return {
    id: String(c.id),
    title: c.title || "Новый чат",
    mode: c.mode,
    updatedAt: c.updated_at,
    pinned: c.pinned,
  };
}

/** Закреплённые — выше, затем по свежести (как ordering на бэке). */
function sortPreviews(list: ChatPreview[]): ChatPreview[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Режим текущего раздела — из пути (/chat, /code, /research). */
function modeFromPath(pathname: string | null): ModeId {
  if (pathname?.startsWith("/code")) return "code";
  if (pathname?.startsWith("/research")) return "research";
  return "chat";
}

type ConversationsContextValue = {
  conversations: readonly ChatPreview[];
  loading: boolean;
  mode: ModeId;
  refresh: () => Promise<void>;
  create: (mode: ModeId) => Promise<string>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  togglePin: (id: string, pinned: boolean) => Promise<void>;
};

const ConversationsContext = createContext<ConversationsContextValue | null>(null);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { userId: clerkUserId } = useAuth();
  const userId = clerkUserId ?? null; // Clerk даёт string | null | undefined
  const pathname = usePathname();
  const mode = modeFromPath(pathname);

  const [conversations, setConversations] = useState<readonly ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const hydratedRef = useRef(false);

  // Тянем диалоги всех режимов сразу — в сайдбаре виден весь список с подписью
  // режима. Список не зависит от текущего раздела, поэтому при переходе между
  // чатами/режимами он не перезагружается (переход мгновенный, без мерцания).
  const refresh = useCallback(async () => {
    try {
      const data = await api.get<ApiConversation[]>("/api/conversations/");
      const list = sortPreviews(data.map(toPreview));
      setConversations(list);
      saveConversationList(userId, list); // обновляем кэш серверной правдой
    } catch {
      // Не залогинен / бэк недоступен — оставляем кэш как есть.
    } finally {
      setLoading(false);
    }
  }, [api, userId]);

  // Мгновенно показываем список из кэша (один раз), затем ревалидируем по сети.
  useEffect(() => {
    if (!hydratedRef.current) {
      const cached = loadConversationList(userId);
      if (cached && cached.length) {
        setConversations(cached);
        setLoading(false);
      }
      hydratedRef.current = true;
    }
    refresh();
  }, [userId, refresh]);

  // Сохраняем непустой список в кэш при любых изменениях (вкл. оптимистичные).
  useEffect(() => {
    if (conversations.length) saveConversationList(userId, conversations);
  }, [conversations, userId]);

  const create = useCallback(
    async (newMode: ModeId) => {
      const c = await api.post<ApiConversation>("/api/conversations/", {
        mode: newMode,
      });
      setConversations((prev) => [toPreview(c), ...prev]);
      return String(c.id);
    },
    [api],
  );

  // Все мутации оптимистичны: меняем состояние сразу, запрос летит в фоне.
  const remove = useCallback(
    async (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      dropMessages(userId, id); // чистим кэш сообщений удалённого чата
      api.delete(`/api/conversations/${id}/`).catch(() => refresh());
    },
    [api, refresh, userId],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      setConversations((prev) =>
        sortPreviews(prev.map((c) => (c.id === id ? { ...c, title } : c))),
      );
      api.patch(`/api/conversations/${id}/`, { title }).catch(() => refresh());
    },
    [api, refresh],
  );

  const togglePin = useCallback(
    async (id: string, pinned: boolean) => {
      setConversations((prev) =>
        sortPreviews(prev.map((c) => (c.id === id ? { ...c, pinned } : c))),
      );
      api.patch(`/api/conversations/${id}/`, { pinned }).catch(() => refresh());
    },
    [api, refresh],
  );

  return (
    <ConversationsContext.Provider
      value={{
        conversations,
        loading,
        mode,
        refresh,
        create,
        remove,
        rename,
        togglePin,
      }}
    >
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations() {
  const ctx = useContext(ConversationsContext);
  if (!ctx) {
    throw new Error(
      "useConversations must be used within <ConversationsProvider>",
    );
  }
  return ctx;
}
