/**
 * Контент страницы /billing. Тарифы и сравнительная таблица.
 *
 * Цены и лимиты — заглушка. После подключения Stripe/ЮKassa и реальных
 * лимитов на бэке эти данные подменятся (или будут читаться из БД).
 */

export type PlanCta = {
  label: string;
  /** Куда отправить пользователя. null = просто отображаемая плашка. */
  href: string | null;
  /** Текущий план / по запросу — отрисовываем как плашку без действия. */
  disabled?: boolean;
};

export type BillingPlan = {
  id: "free" | "pro" | "team";
  name: string;
  /** В рублях. null = «по запросу». */
  price: number | null;
  description: string;
  /** Подпись над карточкой: «текущий план», «популярный», и т.п. */
  tagline?: string;
  features: readonly string[];
  cta: PlanCta;
  featured?: boolean;
};

export const billingPlans: readonly BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    description: "Для знакомства и повседневных учебных задач.",
    tagline: "Ваш текущий план",
    features: [
      "Все режимы: чат, код, исследование",
      "Базовые модели",
      "50 сообщений в день",
      "Контекст до 8K токенов",
      "До 50 МБ материалов",
      "История диалогов",
    ],
    cta: { label: "Текущий план", href: null, disabled: true },
  },
  {
    id: "pro",
    name: "Pro",
    price: 490,
    description: "Для серьёзной учёбы и работы с большим объёмом материалов.",
    tagline: "Самый популярный",
    features: [
      "Безлимит сообщений",
      "Mentor Pro и Mentor Vision",
      "Контекст до 200K токенов",
      "Поиск в интернете",
      "Работа с PDF и таблицами",
      "До 5 ГБ материалов",
      "Расширенная память",
      "Приоритетная очередь",
      "Экспорт конспектов",
    ],
    cta: { label: "Оформить Pro", href: "/billing/checkout?plan=pro" },
    featured: true,
  },
  {
    id: "team",
    name: "Team",
    price: null,
    description: "Для учебных групп, кафедр и онлайн-школ.",
    tagline: "По запросу",
    features: [
      "Всё из Pro для каждого участника",
      "Общая библиотека материалов",
      "Управление участниками",
      "SSO и аналитика",
      "Поддержка 24/7",
      "Кастомные сценарии и промпты",
    ],
    cta: { label: "Связаться", href: "mailto:hello@mentorlm.ru" },
  },
] as const;

/* ───────────────────────  сравнение ─────────────────────── */

export type CompareValue = boolean | string;

export type CompareRow = {
  label: string;
  free: CompareValue;
  pro: CompareValue;
  team: CompareValue;
};

export type CompareGroup = {
  title: string;
  rows: readonly CompareRow[];
};

export const comparisonTable: readonly CompareGroup[] = [
  {
    title: "Использование",
    rows: [
      { label: "Сообщения в день", free: "50", pro: "Без лимита", team: "Без лимита" },
      { label: "Длина контекста", free: "8K токенов", pro: "200K токенов", team: "200K токенов" },
      { label: "Объём материалов", free: "50 МБ", pro: "5 ГБ", team: "Без лимита" },
      { label: "История диалогов", free: true, pro: true, team: true },
    ],
  },
  {
    title: "Модели и инструменты",
    rows: [
      { label: "Базовые модели", free: true, pro: true, team: true },
      { label: "Mentor Pro и Vision", free: false, pro: true, team: true },
      { label: "Поиск в интернете", free: false, pro: true, team: true },
      { label: "Работа с PDF и таблицами", free: false, pro: true, team: true },
      { label: "Расширенная память", free: "10 фактов", pro: "1000 фактов", team: "Без лимита" },
    ],
  },
  {
    title: "Скорость и приоритет",
    rows: [
      { label: "Очередь", free: "Стандарт", pro: "Приоритет", team: "VIP" },
      { label: "Экспорт конспектов", free: false, pro: true, team: true },
    ],
  },
  {
    title: "Команда и интеграции",
    rows: [
      { label: "Общая библиотека", free: false, pro: false, team: true },
      { label: "Управление участниками", free: false, pro: false, team: true },
      { label: "SSO", free: false, pro: false, team: true },
      { label: "Поддержка", free: "Сообщество", pro: "Email", team: "24/7" },
    ],
  },
] as const;
