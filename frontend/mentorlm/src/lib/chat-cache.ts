/**
 * Клиентский кэш чатов в localStorage для мгновенного рендера.
 * Хранит список диалогов и сообщения каждого чата, чтобы сайдбар и тред
 * показывались сразу при переходах/обновлении, пока сеть тянет свежие данные.
 * Ключи неймспейсятся по userId, чтобы чаты не утекали между аккаунтами.
 * Используется в ConversationsProvider и useChatSession.
 */

import type { Message } from "@/components/mainapp/ChatMessage";
import type { ChatPreview } from "@/types/app";

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
const thinkingKey = `mlm.${VERSION}.thinking`;
const MAX_CACHED_PREFS = 200;

// Читает карту «id диалога → значение» (или пустую при любой проблеме).
function readMap(key: string): Record<string, string> {
  const s = ls();
  if (!s) return {};
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// Запоминает значение для диалога, вытесняя самые старые записи.
function writeMap(key: string, conversationId: string, value: string): void {
  const s = ls();
  if (!s) return;
  try {
    const map = readMap(key);
    if (map[conversationId] === value) return;
    delete map[conversationId]; // переносим в конец: свежие записи — последние
    map[conversationId] = value;
    const ids = Object.keys(map);
    for (const stale of ids.slice(0, Math.max(0, ids.length - MAX_CACHED_PREFS))) {
      delete map[stale];
    }
    s.setItem(key, JSON.stringify(map));
  } catch {
    // localStorage недоступен — настройка просто не переживёт перезагрузку
  }
}

// Забывает значение удалённого диалога.
function dropFromMap(key: string, conversationId: string): void {
  const s = ls();
  if (!s) return;
  try {
    const map = readMap(key);
    if (!(conversationId in map)) return;
    delete map[conversationId];
    s.setItem(key, JSON.stringify(map));
  } catch {
    // ignore
  }
}

// Сценарий конкретного диалога (или null, если пользователь его не выбирал).
export function loadScenario(conversationId: string | null): string | null {
  if (!conversationId) return null;
  return readMap(scenariosKey)[conversationId] ?? null;
}

// Запоминает сценарий диалога — он держится, пока пользователь сам его не сменит.
export function saveScenario(
  conversationId: string,
  scenarioId: string,
): void {
  writeMap(scenariosKey, conversationId, scenarioId);
}

// Забывает сценарий удалённого диалога.
export function dropScenario(conversationId: string): void {
  dropFromMap(scenariosKey, conversationId);
}

// Размышление — тоже свойство конкретного диалога: включив его для сложной
// задачи, пользователь не должен переключать его заново на каждый вопрос.
// Дефолт — выключено: ответ с размышлением дольше и дороже по квоте.
export function loadThinking(conversationId: string | null): boolean {
  if (!conversationId) return false;
  return readMap(thinkingKey)[conversationId] === "1";
}

export function saveThinking(conversationId: string, on: boolean): void {
  writeMap(thinkingKey, conversationId, on ? "1" : "0");
}

export function dropThinking(conversationId: string): void {
  dropFromMap(thinkingKey, conversationId);
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

/**
 * Стирает ВЕСЬ локальный кэш — вызывается при выходе из аккаунта.
 *
 * Здесь лежат тексты переписки целиком, и до сих пор они переживали и выход, и
 * удаление аккаунта: человек нажимал «удалить навсегда», сервер честно всё
 * стирал, а на общем компьютере его чаты оставались лежать в localStorage.
 *
 * Идём по префиксу, а не по известным ключам: кэш сообщений заводит ключ на
 * каждый диалог, и список этих ключей сам хранится в кэше — при малейшем
 * рассогласовании остались бы «осиротевшие» записи с перепиской внутри.
 */
export function clearAllCache(uid: string | null): void {
  const s = ls();
  if (!s) return;
  try {
    const prefix = uid ? `mlm.${VERSION}.${uid}.` : `mlm.${VERSION}.`;
    const doomed: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key && (key.startsWith(prefix) || key === scenariosKey)) doomed.push(key);
    }
    for (const key of doomed) s.removeItem(key);
  } catch {
    // ignore
  }
}
