/**
 * Контент страницы тарифов /billing: три плана и сравнительная таблица.
 * Только данные (цены, фичи, тексты кнопок) — без логики оплаты.
 * Используется на странице billing/page.tsx и в её секциях.
 */

// Кнопка-действие тарифа (куда ведёт, активна ли).
export type PlanCta = {
  label: string;
  href: string | null; // null = просто плашка без перехода
  disabled?: boolean; // текущий план / «по запросу» — без действия
};

// Описание одного тарифа.
export type BillingPlan = {
  id: "free" | "plus" | "pro";
  name: string;
  price: number | null; // рубли; null = «по запросу»
  description: string;
  tagline?: string; // подпись над карточкой
  features: readonly string[];
  cta: PlanCta;
  featured?: boolean; // выделенная карточка
};

// Три тарифных плана — карточки на странице /billing.
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
