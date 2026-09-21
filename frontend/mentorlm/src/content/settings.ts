/**
 * Все тексты диалога настроек: заголовки вкладок, подписи полей, подсказки и
 * варианты в селектах.
 *
 * Один файл на весь диалог — правка формулировки не требует открывать
 * компоненты вкладок (components/mainapp/settings/tabs/*).
 *
 * ⚠️ `value` у вариантов — КОДЫ, которые понимает бэкенд (apps/ai/preferences.py);
 * они объявлены типами в types/settings.ts. Подписи (`label`) — свободный
 * текст. Числовые потолки полей — в lib/limits.ts.
 */

import type {
  ContextDepth,
  Creativity,
  EducationLevel,
  LengthPref,
  MemoryScope,
  MemoryUse,
  ModelTier,
  Option,
  ReasoningDepth,
  RetentionDays,
} from "@/types/settings";

// ── Оболочка диалога ────────────────────────────────────────────────────────

export const settingsCopy = {
  title: "Настройки",
  open: "Настройки",
  close: "Закрыть",
} as const;

// Подписи вкладок. Порядок и состав задаются в settings/config.tsx — там же
// лежат иконки и компоненты панелей, здесь только текст.
export const SETTINGS_TAB_LABELS = {
  general: "Общие",
  model: "Модель ИИ",
  memory: "Память",
  subscription: "Подписка",
  payments: "Платежи",
  data: "Данные",
} as const;

// ── Вкладка «Общие» ─────────────────────────────────────────────────────────

export const generalTabCopy = {
  title: "Общие",
  theme: { label: "Тема", hint: "Светлая, тёмная или как в системе" },
  themeOptions: {
    system: "Системная",
    light: "Светлая",
    dark: "Тёмная",
  },
  fontSize: { label: "Размер шрифта в чате" },
  fontSizeOptions: {
    sm: "Мелкий",
    md: "Средний",
    lg: "Крупный",
  },
} as const;

// ── Вкладка «Модель ИИ» ─────────────────────────────────────────────────────

export const modelTabCopy = {
  modelsTitle: "Модель ИИ",
  modelsDescription: "Выбор грейда модели ИИ для каждого режима.",
  styleTitle: "Стиль ответов",
  styleDescription: "Применяется во всех режимах поверх выбранного сценария.",
  creativity: {
    label: "Креативность",
    hint: "Сдвигает «температуру» сценария к точным или к более свободным ответам",
  },
  length: { label: "Длина ответов", hint: "Короче или подробнее" },
  reasoning: {
    label: "Глубина проработки",
    hint: "Быстрее и проще или тщательнее с проверкой логики и ограничений",
  },
} as const;

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

// ── Вкладка «Память» ────────────────────────────────────────────────────────

export const memoryTabCopy = {
  personaTitle: "О вас",
  personaDescription:
    "Модель учитывает это в каждом разговоре, чтобы подбирать примеры и уровень объяснений. Можно оставить пустым.",
  nickname: {
    label: "Как к вам обращаться",
    hint: "Имя или ник для ответов модели",
    placeholder: "Например: Босс",
  },
  occupation: {
    label: "Чем вы занимаетесь",
    hint: "Помогает подбирать примеры",
    placeholder: "Например: студент-программист",
  },
  educationLevel: {
    label: "Уровень обучения",
    hint: "Влияет на глубину объяснений и терминологию",
  },
  fieldOfStudy: {
    label: "Направление / специальность",
    hint: "Помогает подбирать предметные примеры",
    placeholder: "Например: Инженер ПО",
  },
  learningGoals: {
    label: "Цели обучения",
    hint: "Например: подготовиться к экзамену, закрыть практические работы, разобраться в алгоритмах",
    placeholder: "Чего вы хотите достичь…",
  },
  customAbout: {
    label: "Что ещё важно знать о вас",
    hint: "Например: студент 3 курса CS; интересуют ML и алгоритмы; учу английский",
    placeholder: "Расскажите о себе, своей учёбе и интересах…",
  },
  customStyle: {
    label: "Как вы хотите получать ответы",
    hint: "Например: короче, с примерами кода, без воды",
    placeholder: "Опишите предпочитаемый стиль ответов…",
  },
  contextTitle: "Память диалога",
  contextDescription: "Сколько прошлого контекста учитывать.",
  contextDepth: {
    label: "Глубина памяти",
    hint: "Больше истории — точнее для сложных задач, но дороже и медленнее",
  },
  longTermTitle: "Долговременная память",
  longTermDescription:
    "Устойчивые факты о вас, которые модель запоминает между чатами и учитывает в ответах. Ниже их можно посмотреть и удалить.",
  autoMemory: {
    label: "Автоматическая память",
    hint: "Разрешить модели самой запоминать полезные факты о вас",
  },
  memoryScope: {
    label: "Объём автопамяти",
    hint: "Насколько подробно запоминать учебный контекст",
  },
  memoryUse: {
    label: "Использование памяти",
    hint: "Насколько активно подмешивать сохранённые факты в ответы",
  },
} as const;

// Список сохранённых фактов под настройками памяти.
export const savedFactsCopy = {
  title: "Сохранённые факты",
  clearAll: "Очистить все",
  loading: "Загрузка…",
  empty:
    "Пока ничего не сохранено. Если включена автоматическая память, модель будет добавлять сюда устойчивые факты о вас из диалогов.",
  remove: "Удалить факт",
} as const;

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

// ── Вкладка «Данные» ────────────────────────────────────────────────────────

export const dataTabCopy = {
  title: "Данные и приватность",
  retention: {
    label: "Автоудаление старых чатов",
    hint: "Диалоги без активности дольше выбранного срока удаляются автоматически",
  },
  dangerTitle: "Опасная зона",
  dangerDescription: "Эти действия необратимы.",
  deleteChats: "Удалить все чаты",
  deleteChatsConfirm: "Удалить все чаты безвозвратно?",
  deleteAccount: "Удалить аккаунт",
  deletingAccount: "Удаление…",
  deleteAccountConfirm:
    "Удалить аккаунт безвозвратно? Будут стёрты все чаты, настройки и память. " +
    "Это действие нельзя отменить.",
  deleteAccountError:
    "Не удалось удалить аккаунт. Попробуйте позже или напишите в поддержку.",
} as const;

// Срок автоудаления неактивных чатов.
export const RETENTION_OPTIONS: Option<RetentionDays>[] = [
  { value: 0, label: "Не удалять" },
  { value: 30, label: "Старше 30 дней" },
  { value: 90, label: "Старше 90 дней" },
  { value: 180, label: "Старше 180 дней" },
];
