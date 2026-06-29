/**
 * Клиентский кэш чатов для мгновенного рендера.
 *
 * Список диалогов и сообщения каждого чата кэшируются в localStorage (с
 * подстраховкой in-memory). При обновлении страницы и переходах сайдбар и сам
 * чат показываются сразу из кэша, а сеть подтягивает свежие данные в фоне.
 *
 * Ключи неймспейсятся по userId (Clerk), чтобы на общем устройстве чаты одного
 * пользователя не утекали другому. До загрузки Clerk (userId === null) кэш
 * молчит — это безопасно (просто не мгновенно).
 */

import type { Message } from "@/components/mainapp/ChatMessage";
import type { ChatPreview } from "@/lib/mainapp-contents";

const VERSION = "v1";
const MAX_CACHED_CONVS = 40; // сколько чатов держим в кэше сообщений (LRU)

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

const listKey = (uid: string) => `mlm.${VERSION}.${uid}.convs`;
const msgKey = (uid: string, id: string) => `mlm.${VERSION}.${uid}.msg.${id}`;
const idxKey = (uid: string) => `mlm.${VERSION}.${uid}.msgidx`;

// ── Список диалогов ─────────────────────────────────────────────────────────

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

export function saveMessages(
  uid: string | null,
  id: string,
  messages: Message[],
): void {
  const s = ls();
  if (!s || !uid) return;
  try {
    s.setItem(msgKey(uid, id), JSON.stringify(messages));
    // Обновляем LRU-индекс и вытесняем старое, чтобы кэш не рос бесконечно.
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

export function dropMessages(uid: string | null, id: string): void {
  const s = ls();
  if (!s || !uid) return;
  try {
    s.removeItem(msgKey(uid, id));
  } catch {
    // ignore
  }
}
