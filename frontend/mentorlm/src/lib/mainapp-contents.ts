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

/**
 * Иконки сценариев — рендерятся в композере; см. ScenarioIcon в ChatComposer.
 */
export type ScenarioIconId =
  | "book"
  | "wrench"
  | "text"
  | "chat"
  | "write-code"
  | "refactor"
  | "explain"
  | "review"
  | "teach"
  | "tests"
  | "sources"
  | "deep"
  | "overview"
  | "compare"
  | "facts";

export type Scenario = {
  id: string;
  label: string;
  description: string;
  icon: ScenarioIconId;
};

/**
 * Сценарии под полем ввода — пресеты задачи внутри режима. Здесь только то, что
 * нужно UI (подпись, описание, иконка); сам системный промпт и параметры
 * генерации живут на бэке (apps/ai/scenarios.py) и выбираются по id — клиент их
 * не задаёт и не может подменить. У каждого режима свой набор.
 */
export const chatScenarios: readonly Scenario[] = [
  {
    id: "study",
    label: "Изучить",
    description: "Объяснение темы шаг за шагом",
    icon: "book",
  },
  {
    id: "practice",
    label: "Практическая работа",
    description: "Готовая практическая работа под сдачу",
    icon: "wrench",
  },
  {
    id: "text",
    label: "Текст",
    description: "Работа с текстом: написание, редактирование, конспект",
    icon: "text",
  },
  {
    id: "chat",
    label: "Обычный чат",
    description: "Спокойный понятный ответ без лишнего",
    icon: "chat",
  },
] as const;

export const chatDefaultScenarioId = "chat";

export const codeScenarios: readonly Scenario[] = [
  {
    id: "write-code",
    label: "Написать код",
    description: "Реализовать решение по описанию задачи",
    icon: "write-code",
  },
  {
    id: "refactor",
    label: "Рефакторинг кода",
    description: "Улучшить структуру без изменения поведения",
    icon: "refactor",
  },
  {
    id: "explain",
    label: "Объяснить код",
    description: "Разобрать что и как делает код",
    icon: "explain",
  },
  {
    id: "review",
    label: "Ревью кода",
    description: "Найти проблемы и предложить улучшения",
    icon: "review",
  },
  {
    id: "teach",
    label: "Научить писать код",
    description: "Объяснение с примерами и упражнениями",
    icon: "teach",
  },
  {
    id: "tests",
    label: "Написать тесты",
    description: "Покрыть код тестами с граничными случаями",
    icon: "tests",
  },
] as const;

export const codeDefaultScenarioId = "write-code";

export const researchScenarios: readonly Scenario[] = [
  {
    id: "sources",
    label: "Найти источники",
    description: "Подобрать релевантные источники по теме",
    icon: "sources",
  },
  {
    id: "deep",
    label: "Детальное исследование",
    description: "Глубокий разбор темы с разных сторон",
    icon: "deep",
  },
  {
    id: "overview",
    label: "Быстрый обзор темы",
    description: "Короткое введение в тему",
    icon: "overview",
  },
  {
    id: "compare",
    label: "Сравнить",
    description: "Сопоставить варианты по критериям",
    icon: "compare",
  },
  {
    id: "facts",
    label: "Проверить факты",
    description: "Найти первоисточник и проверить утверждение",
    icon: "facts",
  },
] as const;

export const researchDefaultScenarioId = "overview";

export type ChatPreview = {
  id: string;
  title: string;
  mode: ModeId; // режим диалога — показываем подпись в сайдбаре
  updatedAt: string; // ISO
  pinned?: boolean;
};

/**
 * Список последних чатов пользователя.
 *
 * Сейчас пустой — это точка интеграции с бэкендом. В будущем тут будет
 * запрос к Supabase (Server Action / API route), отдающий чаты текущего
 * пользователя из таблицы `chats`, отсортированные по `updated_at desc`.
 *
 * Логика группировки (`groupChatsByDate` ниже) и UI-фолбэк «Чатов пока нет»
 * в `AppSidebar` уже готовы — достаточно подменить массив на реальные данные.
 */
export const recentChats: readonly ChatPreview[] = [] as const;

export const promptSuggestions = [
  "Объясни тему производной с примерами",
  "Разбери эту задачу шаг за шагом",
  "Сделай конспект из этого PDF",
  "Подготовь меня к экзамену по дискретной математике",
] as const;

/**
 * Группировка чатов в сайдбаре: сегодня / вчера / последние 7 дней / раньше.
 */
export function groupChatsByDate(chats: readonly ChatPreview[]) {
  const buckets: Record<string, ChatPreview[]> = {
    Закреплённые: [],
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
    // Закреплённые показываем отдельной группой сверху.
    if (chat.pinned) {
      buckets["Закреплённые"].push(chat);
      continue;
    }
    const t = new Date(chat.updatedAt).getTime();
    if (t >= startOfToday.getTime()) buckets["Сегодня"].push(chat);
    else if (t >= startOfYesterday.getTime()) buckets["Вчера"].push(chat);
    else if (t >= startOfWeek.getTime()) buckets["Последние 7 дней"].push(chat);
    else buckets["Раньше"].push(chat);
  }

  return Object.entries(buckets).filter(([, list]) => list.length > 0);
}
