/**
 * Данные и типы основного приложения (режимы, сценарии, чаты).
 * Описывает три режима (Чат/Код/Исследовать) и их наборы сценариев —
 * подписи и иконки для UI; сами промпты и параметры генерации живут на бэке
 * (apps/ai/scenarios.py) и выбираются по id. Используется в сайдбаре, композере
 * и на страницах режимов.
 */

// Идентификатор режима приложения.
export type ModeId = "chat" | "code" | "research";

// Режим = вкладка приложения со своим URL и подписью.
export type Mode = {
  id: ModeId;
  href: string;
  label: string;
  hint: string;
};

// Три режима приложения — рендерятся в переключателе сайдбара.
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

// Идентификаторы иконок сценариев (маппятся на lucide в ChatComposer).
// Названы по смыслу сценария, а не по картинке: иконку можно поменять, не
// трогая контент, и наоборот — по id всегда видно, о какой задаче речь.
export type ScenarioIconId =
  | "study"
  | "assignment"
  | "writing"
  | "talk"
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

// Сценарий = пресет задачи внутри режима (то, что видит UI).
export type Scenario = {
  id: string;
  label: string;
  description: string;
  icon: ScenarioIconId;
};

// Сценарии режима «Чат» — чипы под полем ввода.
export const chatScenarios: readonly Scenario[] = [
  {
    id: "study",
    label: "Изучить",
    description: "Объяснение темы шаг за шагом",
    icon: "study",
  },
  {
    id: "practice",
    label: "Практическая работа",
    description: "Готовое решение в виде отчета по выполнению практической работы",
    icon: "assignment",
  },
  {
    id: "text",
    label: "Текст",
    description: "Работа с текстом: написание, редактирование, конспектирование и т.д.",
    icon: "writing",
  },
  {
    id: "chat",
    label: "Обычный чат",
    description: "Обычный диалог с ИИ",
    icon: "talk",
  },
] as const;

// Сценарий чата по умолчанию.
export const chatDefaultScenarioId = "chat";

// Сценарии режима «Код».
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
    description: "Покрыть код тестами",
    icon: "tests",
  },
] as const;

// Сценарий кода по умолчанию.
export const codeDefaultScenarioId = "write-code";

// Сценарии режима «Исследовать».
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
    description: "Глубокий разбор темы",
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

// Сценарий исследования по умолчанию.
export const researchDefaultScenarioId = "overview";

// Превью чата для списка в сайдбаре.
export type ChatPreview = {
  id: string;
  title: string;
  mode: ModeId; // режим диалога — показываем подпись в сайдбаре
  updatedAt: string; // ISO
  pinned?: boolean;
};

// Группирует чаты сайдбара по времени: закреплённые/сегодня/вчера/7 дней/раньше.
export function groupChatsByDate(chats: readonly ChatPreview[]) {
  const buckets: Record<string, ChatPreview[]> = {
    Закреплённые: [],
    Сегодня: [],
    Вчера: [],
    "Последние 7 дней": [],
    Раньше: [],
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
      buckets["Закреплённые"].push(chat);
      continue;
    }
    const t = new Date(chat.updatedAt).getTime();
    if (t >= startOfToday.getTime()) buckets["Сегодня"].push(chat);
    else if (t >= startOfYesterday.getTime()) buckets["Вчера"].push(chat);
    else if (t >= startOfWeek.getTime()) buckets["Последние 7 дней"].push(chat);
    else buckets["Раньше"].push(chat);
  }

  // Отдаём только непустые группы в порядке объявления.
  return Object.entries(buckets).filter(([, list]) => list.length > 0);
}
