/**
 * Клиентский кэш чатов в localStorage для мгновенного рендера.
 * Хранит список диалогов и сообщения каждого чата, чтобы сайдбар и тред
 * показывались сразу при переходах/обновлении, пока сеть тянет свежие данные.
 * Ключи неймспейсятся по userId (Clerk), чтобы чаты не утекали между аккаунтами.
 * Используется в ConversationsProvider и useChatSession.
 */

import type { Message } from "@/components/mainapp/ChatMessage";
import type { ChatPreview } from "@/lib/mainapp-contents";

const VERSION = "v1";
const MAX_CACHED_CONVS = 40; // сколько чатов держим в кэше сообщений (LRU)

// Безопасный доступ к localStorage (null в SSR или при блокировке хранилища).
function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

// Ключи хранилища, неймспейснутые по версии и userId.
const listKey = (uid: string) => `mlm.${VERSION}.${uid}.convs`;
const msgKey = (uid: string, id: string) => `mlm.${VERSION}.${uid}.msg.${id}`;
const idxKey = (uid: string) => `mlm.${VERSION}.${uid}.msgidx`;

// ── Список диалогов ─────────────────────────────────────────────────────────

// Читает кэшированный список чатов пользователя (или null).
export function loadConversationList(uid: string | null): ChatPreview[] | null {
  const s = ls();
  if (!s || !uid) return null;
  try {
    const raw = s.getItem(listKey(uid));
    return raw ? (JSON.parse(raw) as ChatPreview[]) : null;
  } catch {
    return null;
  }
}

// Сохраняет список чатов пользователя в кэш.
export function saveConversationList(
  uid: string | null,
  list: readonly ChatPreview[],
): void {
  const s = ls();
  if (!s || !uid) return;
  try {
    s.setItem(listKey(uid), JSON.stringify(list));
  } catch {
    // переполнение/недоступность localStorage — не критично
  }
}

// ── Сообщения чата ──────────────────────────────────────────────────────────

// Читает кэшированные сообщения конкретного чата (или null).
export function loadMessages(uid: string | null, id: string): Message[] | null {
  const s = ls();
  if (!s || !uid) return null;
  try {
    const raw = s.getItem(msgKey(uid, id));
    return raw ? (JSON.parse(raw) as Message[]) : null;
  } catch {
    return null;
  }
}

// Сохраняет сообщения чата и обновляет LRU-индекс, вытесняя старьё.
export function saveMessages(
  uid: string | null,
  id: string,
  messages: Message[],
): void {
  const s = ls();
  if (!s || !uid) return;
  try {
    s.setItem(msgKey(uid, id), JSON.stringify(messages));
    // LRU-индекс: свежий чат — в начало, лишнее сверх лимита удаляем.
    let idx: string[] = [];
    try {
      idx = JSON.parse(s.getItem(idxKey(uid)) || "[]") as string[];
    } catch {
      idx = [];
    }
    idx = [id, ...idx.filter((x) => x !== id)];
    while (idx.length > MAX_CACHED_CONVS) {
      const evicted = idx.pop();
      if (evicted) s.removeItem(msgKey(uid, evicted));
    }
    s.setItem(idxKey(uid), JSON.stringify(idx));
  } catch {
    // ignore
  }
}

// Удаляет кэш сообщений одного чата (при удалении диалога).
export function dropMessages(uid: string | null, id: string): void {
  const s = ls();
  if (!s || !uid) return;
  try {
    s.removeItem(msgKey(uid, id));
  } catch {
    // ignore
  }
}
