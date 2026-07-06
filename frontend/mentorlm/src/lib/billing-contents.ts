/* Контент страницы /billing. Тарифы и сравнительная таблица. */

export type PlanCta = {
  label: string;
  /** Куда отправить пользователя. null = просто отображаемая плашка. */
  href: string | null;
  /** Текущий план / по запросу — отрисовываем как плашку без действия. */
  disabled?: boolean;
};

export type BillingPlan = {
  id: "free" | "plus" | "pro";
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
      "20 сообщений в день",
      "Контекст до 8K токенов",
      "Исследование — 3, код — 5 в день",
      "История диалогов",
    ],
    cta: { label: "Текущий план", href: null, disabled: true },
  },
  {
    id: "plus",
    name: "Plus",
    price: 349,
    description: "Основной тариф для серьёзной учёбы и работы.",
    tagline: "Самый популярный",
    features: [
      "150 сообщений в день",
      "Максимальная модель",
      "Контекст до 32K токенов",
      "Поиск в интернете",
      "Исследование — 30, код — 40 в день",
      "Расширенная память",
    ],
    cta: { label: "Оформить Plus", href: "/billing/checkout?plan=plus" },
    featured: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 990,
    description: "Для активных студентов, дипломов, ресёрча и кода.",
    tagline: "Максимум возможностей",
    features: [
      "400 сообщений в день",
      "Максимальная модель без компромиссов",
      "Контекст до 128K токенов",
      "Поиск в интернете",
      "Исследование — 150, код — 200 в день",
      "Приоритетная очередь",
    ],
    cta: { label: "Оформить Pro", href: "/billing/checkout?plan=pro" },
  },
] as const;

/* ───────────────────────  сравнение ─────────────────────── */

export type CompareValue = boolean | string;

export type CompareRow = {
  label: string;
  free: CompareValue;
  plus: CompareValue;
  pro: CompareValue;
};

export type CompareGroup = {
  title: string;
  rows: readonly CompareRow[];
};

export const comparisonTable: readonly CompareGroup[] = [
  {
    title: "Использование",
    rows: [
      { label: "Сообщения в день", free: "20", plus: "150", pro: "400" },
      { label: "Длина контекста", free: "8K токенов", plus: "32K токенов", pro: "128K токенов" },
      { label: "Исследований в день", free: "3", plus: "30", pro: "150" },
      { label: "Запросов кода в день", free: "5", plus: "40", pro: "200" },
      { label: "История диалогов", free: true, plus: true, pro: true },
    ],
  },
  {
    title: "Модели и инструменты",
    rows: [
      { label: "Базовые модели", free: true, plus: true, pro: true },
      { label: "Максимальная модель", free: false, plus: true, pro: true },
      { label: "Поиск в интернете", free: false, plus: true, pro: true },
      { label: "Расширенная память", free: "10 фактов", plus: "1000 фактов", pro: "Без лимита" },
    ],
  },
  {
    title: "Скорость и приоритет",
    rows: [
      { label: "Очередь", free: "Стандарт", plus: "Приоритет", pro: "VIP" },
      { label: "Экспорт конспектов", free: false, plus: true, pro: true },
    ],
  },
] as const;
