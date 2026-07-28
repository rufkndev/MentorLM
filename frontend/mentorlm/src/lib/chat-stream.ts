/**
 * Реестр «живых» ответов модели — вне React-дерева.
 *
 * Ответ пишется минутами, а экран чата за это время может размонтироваться:
 * пользователь уходит в другой режим, открывает /billing или сворачивает окно.
 * Раньше растущий текст жил в состоянии компонента и при возврате пропадал —
 * генерация на бэке продолжалась и ответ сохранялся в БД, но пользователь его
 * не видел. Здесь ответ живёт в модуле (переживает любую клиентскую навигацию,
 * не переживает только перезагрузку страницы), а экран на него подписывается.
 *
 * Ключ — id диалога. Хранится только ответ ассистента: сообщение пользователя
 * бэк сохраняет сразу, и оно приходит в истории.
 */

import type { Message } from "@/components/mainapp/ChatMessage";

export type LiveReply = {
  /** Растущее сообщение ассистента — рисуется в треде как обычное. */
  message: Message;
  /** Генерация ещё идёт. */
  streaming: boolean;
  /** id ответа в БД (в конце стрима). По нему понимаем, что история догнала. */
  messageId: number | null;
  /** Остановить генерацию (кнопка «Стоп»). */
  abort: () => void;
};

type Entry = { snapshot: LiveReply | null; listeners: Set<() => void> };

const entries = new Map<string, Entry>();

// Запись диалога: слушатели переживают смену снапшота — подписка привязана к
// диалогу, а не к конкретному состоянию ответа.
function entryOf(convId: string): Entry {
  let entry = entries.get(convId);
  if (!entry) {
    entry = { snapshot: null, listeners: new Set() };
    entries.set(convId, entry);
  }
  return entry;
}

// Новый снапшот + уведомление подписчиков. Снапшоты неизменяемые: подписка
// через useSyncExternalStore требует стабильной ссылки, пока ничего не менялось.
function commit(convId: string, snapshot: LiveReply | null) {
  const entry = entryOf(convId);
  entry.snapshot = snapshot;
  entry.listeners.forEach((l) => l());
  if (!snapshot && !entry.listeners.size) entries.delete(convId);
}

/** Начать живой ответ в диалоге (после того, как известен его id). */
export function beginReply(
  convId: string,
  message: Message,
  abort: () => void,
): void {
  commit(convId, { message, streaming: true, messageId: null, abort });
}

/** Дописать очередной кусок текста ответа. */
export function appendDelta(convId: string, delta: string): void {
  const current = getReply(convId);
  if (!current) return;
  commit(convId, {
    ...current,
    message: {
      ...current.message,
      thinking: false,
      content: current.message.content + delta,
    },
  });
}

/** Изменить сам ответ (плашки: деградация, остановка, текст ошибки). */
export function patchReply(convId: string, patch: Partial<Message>): void {
  const current = getReply(convId);
  if (!current) return;
  commit(convId, { ...current, message: { ...current.message, ...patch } });
}

/** Завершить ответ: генерация окончена, известен (или нет) его id в БД. */
export function endReply(convId: string, messageId: number | null): void {
  const current = getReply(convId);
  if (!current) return;
  commit(convId, {
    ...current,
    streaming: false,
    messageId,
    message: { ...current.message, thinking: false },
  });
}

/** Убрать живой ответ — когда история с сервера его уже содержит. */
export function dropReply(convId: string): void {
  commit(convId, null);
}

export function getReply(convId: string | null): LiveReply | null {
  if (!convId) return null;
  return entries.get(convId)?.snapshot ?? null;
}

export function subscribeReply(
  convId: string | null,
  listener: () => void,
): () => void {
  if (!convId) return () => {};
  const entry = entryOf(convId);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    // Подписчиков не осталось и ответа тоже — чистим за собой.
    if (!entry.listeners.size && !entry.snapshot) entries.delete(convId);
  };
}
