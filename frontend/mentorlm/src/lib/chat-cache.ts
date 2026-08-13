/**
 * Клиентский кэш чатов в localStorage для мгновенного рендера.
 * Хранит список диалогов и сообщения каждого чата, чтобы сайдбар и тред
 * показывались сразу при переходах/обновлении, пока сеть тянет свежие данные.
 * Ключи неймспейсятся по userId, чтобы чаты не утекали между аккаунтами.
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

// ── Выбранный сценарий диалога ──────────────────────────────────────────────
// Сценарий — свойство КОНКРЕТНОГО чата, а не режима: вернувшись в старый чат,
// пользователь застаёт тот же пресет, а новый чат всегда начинается с дефолта
// режима. Бэк хранит его же на диалоге (Conversation.scenario_id); локальная
// карта нужна для мгновенного рендера и для смены сценария до первой отправки.
// Одна запись на все чаты (а не ключ на чат) — так проще держать размер под
// контролем; id диалогов уникальны глобально, поэтому userId в ключе не нужен.

const scenariosKey = `mlm.${VERSION}.scenarios`;
const MAX_CACHED_SCENARIOS = 200;

// Читает карту «id диалога → id сценария» (или пустую при любой проблеме).
function readScenarios(): Record<string, string> {
  const s = ls();
  if (!s) return {};
  try {
    const raw = s.getItem(scenariosKey);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// Сценарий конкретного диалога (или null, если пользователь его не выбирал).
export function loadScenario(conversationId: string | null): string | null {
  if (!conversationId) return null;
  return readScenarios()[conversationId] ?? null;
}

// Запоминает сценарий диалога — он держится, пока пользователь сам его не сменит.
export function saveScenario(
  conversationId: string,
  scenarioId: string,
): void {
  const s = ls();
  if (!s) return;
  try {
    const map = readScenarios();
    if (map[conversationId] === scenarioId) return;
    delete map[conversationId]; // переносим в конец: свежие записи — последние
    map[conversationId] = scenarioId;
    const ids = Object.keys(map);
    for (const stale of ids.slice(0, Math.max(0, ids.length - MAX_CACHED_SCENARIOS))) {
      delete map[stale];
    }
    s.setItem(scenariosKey, JSON.stringify(map));
  } catch {
    // localStorage недоступен — сценарий просто не переживёт перезагрузку
  }
}

// Забывает сценарий удалённого диалога.
export function dropScenario(conversationId: string): void {
  const s = ls();
  if (!s) return;
  try {
    const map = readScenarios();
    if (!(conversationId in map)) return;
    delete map[conversationId];
    s.setItem(scenariosKey, JSON.stringify(map));
  } catch {
    // ignore
  }
}

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
