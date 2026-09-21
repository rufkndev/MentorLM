/**
 * Типы основного приложения: режимы, сценарии, чаты.
 *
 * Отдельно от content/app.ts намеренно. Здесь — КОНТРАКТ с бэкендом: строковые
 * коды режимов и сценариев, по которым бэк выбирает системный промпт и модель
 * (apps/ai/registry.py, apps/ai/scenarios.py). Переименовать код здесь — это
 * поломать API; переписать подпись в content/app.ts — это поправить текст.
 * Разная цена ошибки, поэтому разные файлы.
 */

// Идентификатор режима приложения.
export type ModeId = "chat" | "code" | "research";

// Режим = вкладка приложения со своим URL и подписью.
export type Mode = {
  id: ModeId;
  href: string;
  label: string;
  hint: string;
  placeholder: string; // подсказка в поле ввода этого режима
};

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
// `id` уходит на бэкенд и обязан совпадать с ключом в apps/ai/scenarios.py.
export type Scenario = {
  id: string;
  label: string;
  description: string;
  icon: ScenarioIconId;
};

// Превью чата для списка в сайдбаре.
export type ChatPreview = {
  id: string;
  title: string;
  mode: ModeId; // режим диалога — показываем подпись в сайдбаре
  updatedAt: string; // ISO
  pinned?: boolean;
};

// Временная группа в списке чатов. Код группы отделён от её подписи: сортировка
// и раскладка живут в lib/chats.ts, а текст заголовка — в content/app.ts.
export type ChatGroupId = "pinned" | "today" | "yesterday" | "week" | "older";
