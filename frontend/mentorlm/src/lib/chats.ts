/**
 * Раскладка списка чатов сайдбара по временным группам.
 *
 * Возвращает КОДЫ групп, а не заголовки: подпись («Сегодня», «Раньше») — это
 * текст, он живёт в content/app.ts и меняется без правки логики. Здесь только
 * границы суток и порядок групп.
 */

import type { ChatGroupId, ChatPreview } from "@/types/app";

// Порядок групп в сайдбаре = порядок объявления. Закреплённые всегда сверху.
const ORDER: readonly ChatGroupId[] = [
  "pinned",
  "today",
  "yesterday",
  "week",
  "older",
];

/** Группирует чаты по времени; пустые группы не возвращаются. */
export function groupChatsByDate(
  chats: readonly ChatPreview[],
): [ChatGroupId, ChatPreview[]][] {
  const buckets: Record<ChatGroupId, ChatPreview[]> = {
    pinned: [],
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };

  // Границы временных корзин от начала сегодняшнего дня.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  // Раскладываем чаты по корзинам; закреплённые — всегда сверху.
  for (const chat of chats) {
    if (chat.pinned) {
      buckets.pinned.push(chat);
      continue;
    }
    const t = new Date(chat.updatedAt).getTime();
    if (t >= startOfToday.getTime()) buckets.today.push(chat);
    else if (t >= startOfYesterday.getTime()) buckets.yesterday.push(chat);
    else if (t >= startOfWeek.getTime()) buckets.week.push(chat);
    else buckets.older.push(chat);
  }

  return ORDER.filter((id) => buckets[id].length > 0).map((id) => [
    id,
    buckets[id],
  ]);
}
