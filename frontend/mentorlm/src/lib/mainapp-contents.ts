/**
 * Контент и типы для основного приложения.
 * Сейчас все данные мокаются на клиенте — позже это место станет
 * источником данных из Supabase / API.
 */

export type ModeId = "chat" | "code" | "research";

export type Mode = {
  id: ModeId;
  href: string;
  label: string;
  hint: string;
};

export const modes: readonly Mode[] = [
  { id: "chat", href: "/chat", label: "Чат", hint: "Общий учебный диалог" },
  { id: "code", href: "/code", label: "Код", hint: "Разбор и написание кода" },
  {
    id: "research",
    href: "/research",
    label: "Исследовать",
    hint: "Поиск по материалам и веб-источникам",
  },
] as const;

export type Scenario = {
  id: string;
  label: string;
  description: string;
  systemPrompt: string;
};

/**
 * Сценарии под полем ввода — это пресеты системного промпта.
 * Позже будут редактируемыми в настройках профиля.
 */
export const chatScenarios: readonly Scenario[] = [
  {
    id: "default",
    label: "Обычный ответ",
    description: "Спокойный понятный ответ без лишнего",
    systemPrompt:
      "Ты — учебный AI-ассистент. Отвечай ясно, без лишней воды, на русском. Если задан вопрос — отвечай по существу.",
  },
  {
    id: "study",
    label: "Для изучения",
    description: "Объяснение темы шаг за шагом",
    systemPrompt:
      "Объясняй тему как наставник: с определениями, примерами и шагами. Проверяй понимание короткими вопросами.",
  },
  {
    id: "practice",
    label: "Для практики",
    description: "Разбор задачи без готового ответа",
    systemPrompt:
      "Не давай готовый ответ. Веди по решению вопросами и подсказками, чтобы пользователь сам пришёл к ответу.",
  },
] as const;

export type ChatPreview = {
  id: string;
  title: string;
  updatedAt: string; // ISO
};

/**
 * Мок последних чатов — будет заменён на реальные данные из БД.
 * Группировка по дате считается во время рендера в сайдбаре.
 */
export const mockChats: readonly ChatPreview[] = [
  { id: "c1", title: "Производная сложной функции", updatedAt: isoDaysAgo(0) },
  { id: "c2", title: "Конспект по линейной алгебре", updatedAt: isoDaysAgo(0) },
  { id: "c3", title: "Разбор задачи по физике", updatedAt: isoDaysAgo(1) },
  { id: "c4", title: "План диплома: введение", updatedAt: isoDaysAgo(2) },
  { id: "c5", title: "Алгоритм Дейкстры на Python", updatedAt: isoDaysAgo(6) },
  { id: "c6", title: "Английский: грамматика perfect", updatedAt: isoDaysAgo(12) },
] as const;

export const promptSuggestions = [
  "Объясни тему производной с примерами",
  "Разбери эту задачу шаг за шагом",
  "Сделай конспект из этого PDF",
  "Подготовь меня к экзамену по дискретной математике",
] as const;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * Группировка чатов в сайдбаре: сегодня / вчера / последние 7 дней / раньше.
 */
export function groupChatsByDate(chats: readonly ChatPreview[]) {
  const buckets: Record<string, ChatPreview[]> = {
    Сегодня: [],
    Вчера: [],
    "Последние 7 дней": [],
    Раньше: [],
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  for (const chat of chats) {
    const t = new Date(chat.updatedAt).getTime();
    if (t >= startOfToday.getTime()) buckets["Сегодня"].push(chat);
    else if (t >= startOfYesterday.getTime()) buckets["Вчера"].push(chat);
    else if (t >= startOfWeek.getTime()) buckets["Последние 7 дней"].push(chat);
    else buckets["Раньше"].push(chat);
  }

  return Object.entries(buckets).filter(([, list]) => list.length > 0);
}
