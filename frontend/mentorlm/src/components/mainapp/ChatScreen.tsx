"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { AnimatePresence, motion } from "motion/react";
import {
  ChatComposer,
  type ComposerSubmit,
} from "@/components/mainapp/ChatComposer";
import { ChatEmpty } from "@/components/mainapp/ChatEmpty";
import { ChatMessage, type Message } from "@/components/mainapp/ChatMessage";
import { useConversations } from "@/components/mainapp/ConversationsProvider";
import { ApiError, useApi } from "@/lib/api";
import { loadMessages, saveMessages } from "@/lib/chat-cache";
import type { Scenario } from "@/lib/mainapp-contents";

type Props = {
  scenarios: readonly Scenario[];
  defaultScenarioId: string;
  greeting?: string;
  placeholder?: string;
};

/** Сообщение из истории диалога (см. MessageSerializer на бэке). */
type ApiMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

export function ChatScreen(props: Props) {
  // useSearchParams требует Suspense-границы при сборке (CSR bailout).
  return (
    <Suspense fallback={<div className="h-[calc(100vh-1.5rem)]" />}>
      <ChatScreenInner {...props} />
    </Suspense>
  );
}

function ChatScreenInner({
  scenarios,
  defaultScenarioId,
  greeting,
  placeholder,
}: Props) {
  const api = useApi();
  const { userId: clerkUserId } = useAuth();
  const userId = clerkUserId ?? null;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, create, refresh } = useConversations();

  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // id активного диалога; ref — чтобы сравнивать с URL без перезагрузки истории.
  const [convId, setConvId] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  convIdRef.current = convId;

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Подгрузка истории при переходе на /<mode>?c=<id> (в т.ч. из сайдбара).
  // Сначала мгновенно показываем кэш, параллельно тянем свежую историю —
  // переход в чат происходит без пустого экрана и задержки.
  useEffect(() => {
    const urlC = searchParams.get("c");
    if (!urlC) {
      setConvId(null);
      setMessages([]);
      return;
    }
    if (urlC === convIdRef.current) return; // уже активен (напр. только создан)

    setConvId(urlC);
    const cached = loadMessages(userId, urlC);
    if (cached) setMessages(cached); // мгновенный рендер из кэша

    let cancelled = false;
    api
      .get<{ messages: ApiMessage[] }>(`/api/conversations/${urlC}/`)
      .then((data) => {
        if (cancelled) return;
        const msgs = data.messages.map((m) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
        }));
        setMessages(msgs);
        saveMessages(userId, urlC, msgs);
      })
      .catch(() => {
        if (!cancelled && !cached) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, api, userId]);

  // На жёстком обновлении страницы userId от Clerk появляется не сразу. Как
  // только он готов — подставляем кэш, если история ещё не показана (не трогаем
  // активный стрим: там messages уже непустой).
  useEffect(() => {
    const urlC = searchParams.get("c");
    if (!urlC || !userId) return;
    setMessages((prev) => (prev.length ? prev : loadMessages(userId, urlC) ?? prev));
  }, [userId, searchParams]);

  // Кэшируем сообщения активного чата, когда стрим завершён.
  useEffect(() => {
    if (!convId || sending) return;
    const real = messages.filter((m) => !m.thinking);
    if (real.length) saveMessages(userId, convId, real);
  }, [convId, sending, messages, userId]);

  const handleSubmit = useCallback(
    async ({ text, scenarioId }: ComposerSubmit) => {
      if (sending) return;

      setSending(true);

      // Сразу показываем сообщение пользователя и «думаю» — без ожидания сети,
      // чтобы переход в чат и индикация были мгновенными.
      const placeholderId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: text },
        { id: placeholderId, role: "assistant", content: "", thinking: true },
      ]);

      // Создаём диалог при первом сообщении и фиксируем его в URL.
      let id = convIdRef.current;
      if (!id) {
        try {
          id = await create(mode);
        } catch {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? { ...m, thinking: false, content: "Не удалось создать чат." }
                : m,
            ),
          );
          setSending(false);
          return;
        }
        setConvId(id);
        convIdRef.current = id;
        router.replace(`/${mode}?c=${id}`);
      }

      try {
        await api.stream(
          `/api/conversations/${id}/messages/`,
          // Промпт сценария выбирает бэк по scenario_id — клиент его не задаёт.
          { content: text, scenario_id: scenarioId },
          {
            onDelta: (delta) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? { ...m, thinking: false, content: m.content + delta }
                    : m,
                ),
              );
            },
          },
        );
      } catch (err) {
        const detail = err instanceof ApiError ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? {
                  ...m,
                  thinking: false,
                  content: `Не удалось получить ответ.\n\n${detail}`,
                }
              : m,
          ),
        );
      } finally {
        setSending(false);
        // Обновляем сайдбар: заголовок чата и порядок по последней активности.
        refresh();
      }
    },
    [api, create, mode, refresh, router, sending],
  );

  // Если в URL есть ?c=<id> — это открытый чат: сразу показываем тред (без
  // вспышки приветствия и анимации empty→thread), даже пока грузится история.
  const isEmpty = !searchParams.get("c") && messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      <AnimatePresence mode="wait">
        {isEmpty ? (
          <motion.section
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex flex-1 flex-col items-center justify-center px-6"
          >
            <ChatEmpty greeting={greeting} />
            <div className="mt-10 w-full">
              <ChatComposer
                variant="hero"
                scenarios={scenarios}
                defaultScenarioId={defaultScenarioId}
                onSubmit={handleSubmit}
                placeholder={placeholder}
                disabled={sending}
              />
            </div>
          </motion.section>
        ) : (
          <motion.section
            key="thread"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="relative flex flex-1 flex-col overflow-hidden"
          >
            <div
              ref={threadRef}
              className="flex-1 overflow-y-auto px-4 [scrollbar-width:thin]"
            >
              <div className="mx-auto flex max-w-5xl flex-col gap-5 py-6">
                {messages.map((m) => (
                  <ChatMessage key={m.id} message={m} />
                ))}
              </div>
            </div>

            <div className="px-4 pb-5 pt-2">
              <ChatComposer
                scenarios={scenarios}
                defaultScenarioId={defaultScenarioId}
                onSubmit={handleSubmit}
                placeholder={placeholder}
                disabled={sending}
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
