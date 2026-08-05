/**
 * Справочник опций для диалога настроек (вкладки «Модель ИИ», «Память», «Данные»).
 * Здесь только типы и списки вариантов для селектов/переключателей — без логики.
 * Значения обязаны совпадать с бэком (apps/ai/preferences.py).
 * Используется в компонентах settings/tabs/* и в SettingsProvider.
 */

// Типы значений настроек (строковые коды, понятные бэку).
export type ModelTier = "default" | "fast" | "quality";
export type Creativity = "precise" | "balanced" | "creative";
export type LengthPref = "shorter" | "default" | "longer";
export type ReasoningDepth = "fast" | "auto" | "deep";
export type EducationLevel =
  | ""
  | "school"
  | "college"
  | "bachelor"
  | "master"
  | "postgraduate"
  | "other";
export type ContextDepth = "compact" | "normal" | "deep" | "maximum";
export type MemoryScope = "minimal" | "balanced" | "detailed";
export type MemoryUse = "off" | "auto" | "always";
export type RetentionDays = 0 | 30 | 90 | 180;

// Общая форма пункта селекта: код значения + подпись в UI.
type Option<T extends string> = { value: T; label: string };

// ── Модель ИИ ──

// Тир модели: скорость против качества.
export const MODEL_TIER_OPTIONS: Option<ModelTier>[] = [
  { value: "fast", label: "Быстрая" },
  { value: "default", label: "Стандартная" },
  { value: "quality", label: "Максимальная" },
];

// Креативность ответов (смещает «температуру» сценария).
export const CREATIVITY_OPTIONS: Option<Creativity>[] = [
  { value: "precise", label: "Точные" },
  { value: "balanced", label: "Сбалансированные" },
  { value: "creative", label: "Творческие" },
];

// Предпочтительная длина ответа.
export const LENGTH_PREF_OPTIONS: Option<LengthPref>[] = [
  { value: "shorter", label: "Короче" },
  { value: "default", label: "Стандартно" },
  { value: "longer", label: "Подробнее" },
];

// Глубина проработки ответа.
export const REASONING_DEPTH_OPTIONS: Option<ReasoningDepth>[] = [
  { value: "fast", label: "Быстро" },
  { value: "auto", label: "Авто" },
  { value: "deep", label: "Тщательно" },
];

// Режимы, для которых пользователь выбирает модель (порядок = порядок в UI).
export const MODEL_MODE_FIELDS = [
  {
    key: "chat_model",
    label: "Модель режима «Общий»",
    hint: "Чат и общие учебные вопросы",
  },
  {
    key: "code_model",
    label: "Модель режима «Код»",
    hint: "Написание, разбор и ревью кода",
  },
  {
    key: "research_model",
    label: "Модель режима «Исследовать»",
    hint: "Поиск источников и анализ темы",
  },
] as const;

// ── Память ──

// Уровень обучения пользователя (влияет на глубину объяснений).
export const EDUCATION_LEVEL_OPTIONS: Option<EducationLevel>[] = [
  { value: "", label: "Не указано" },
  { value: "school", label: "Школа" },
  { value: "college", label: "Колледж" },
  { value: "bachelor", label: "Бакалавриат" },
  { value: "master", label: "Магистратура" },
  { value: "postgraduate", label: "Аспирантура" },
];

// Сколько истории диалога учитывать.
export const CONTEXT_DEPTH_OPTIONS: Option<ContextDepth>[] = [
  { value: "compact", label: "Компактно" },
  { value: "normal", label: "Обычно" },
  { value: "deep", label: "Глубоко" },
  { value: "maximum", label: "Максимум" },
];

// Насколько подробно запоминать факты о пользователе.
export const MEMORY_SCOPE_OPTIONS: Option<MemoryScope>[] = [
  { value: "minimal", label: "Минимальный" },
  { value: "balanced", label: "Сбалансированный" },
  { value: "detailed", label: "Подробный" },
];

// Насколько активно подмешивать сохранённые факты в ответы.
export const MEMORY_USE_OPTIONS: Option<MemoryUse>[] = [
  { value: "off", label: "Не использовать" },
  { value: "auto", label: "Автоматически" },
  { value: "always", label: "Всегда" },
];

// ── Данные ──

// Срок автоудаления неактивных чатов.
export const RETENTION_OPTIONS: { value: RetentionDays; label: string }[] = [
  { value: 0, label: "Не удалять" },
  { value: 30, label: "Старше 30 дней" },
  { value: 90, label: "Старше 90 дней" },
  { value: 180, label: "Старше 180 дней" },
];
