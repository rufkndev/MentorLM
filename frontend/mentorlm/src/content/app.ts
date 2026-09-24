/**
 * Все тексты основного приложения (рабочего пространства).
 *
 * Здесь копирайт трёх режимов и их сценариев плюс подписи оболочки: сайдбар,
 * экран чата, композер, сообщение, меню аккаунта. Один файл на всю рабочую
 * область — чтобы поправить формулировку, не нужно искать её по компонентам.
 *
 * Тексты настроек — в content/settings.ts, оплаты — в content/billing.ts.
 *
 * ⚠️ Строковые id (`ModeId`, `Scenario.id`) — это КОНТРАКТ: по ним бэкенд
 * выбирает системный промпт и модель (apps/ai/registry.py, apps/ai/scenarios.py).
 * Подписи менять можно свободно, id — только вместе с бэкендом. Сами промпты и
 * параметры генерации живут на бэке и клиентом не задаются.
 */

import type {
  ChatGroupId,
  Mode,
  Scenario,
} from "@/types/app";

// ── Режимы ──────────────────────────────────────────────────────────────────

// Три режима приложения — рендерятся в переключателе сайдбара.
export const modes: readonly Mode[] = [
  {
    id: "chat",
    href: "/chat",
    label: "Чат",
    hint: "Общий учебный диалог",
    placeholder: "Спросите что угодно по учёбе…",
  },
  {
    id: "code",
    href: "/code",
    label: "Код",
    hint: "Разбор и написание кода",
    placeholder: "Вставьте код или опишите задачу…",
  },
  {
    id: "research",
    href: "/research",
    label: "Исследовать",
    hint: "Поиск по материалам и веб-источникам",
    placeholder: "Что нужно исследовать?",
  },
] as const;

// ── Сценарии ────────────────────────────────────────────────────────────────

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

// ── Сайдбар ─────────────────────────────────────────────────────────────────

// Заголовки временных групп в списке чатов (коды групп — lib/chats.ts).
export const chatGroupLabels: Record<ChatGroupId, string> = {
  pinned: "Закреплённые",
  today: "Сегодня",
  yesterday: "Вчера",
  week: "Последние 7 дней",
  older: "Раньше",
};

export const sidebarCopy = {
  homeLabel: "На главную",
  collapse: "Свернуть сайдбар",
  expand: "Показать сайдбар",
  newChat: "Новый чат",
  searchPlaceholder: "Поиск по чатам",
  emptyList: "Чатов пока нет",
  usageTitle: (modeLabel: string) => `${modeLabel} · осталось`,
  settings: "Настройки",
  upsell: (planName: string) => `Перейти на ${planName}`,
  // Подписи окон квоты приходят с бэкенда словами («5 часов», «7 дней»);
  // в узкой колонке сайдбара они не помещаются, поэтому сокращаются.
  windowShort: [
    ["часов", "ч"],
    ["дней", "дн"],
  ] as const,
  // Контекстное меню чата.
  rowMenu: "Действия с чатом",
  renamePrompt: "Новое название чата",
  rename: "Переименовать",
  pin: "Закрепить",
  unpin: "Открепить",
  delete: "Удалить",
} as const;

// ── Экран чата ──────────────────────────────────────────────────────────────

export const chatCopy = {
  offline: "Нет соединения — сообщение не отправится",
  // Заголовок пустого экрана разрезан на части: середина набирается акцентным
  // начертанием (.font-editorial), поэтому это не одна строка, а три.
  emptyTitleBefore: "С чем помочь сегодня? ",
  emptyTitleAccent: "учим",
  emptyTitleAfter: " вместе.",
  emptySubtitle: "Задайте вопрос, прикрепите материалы или выберите подсказку ниже.",
  defaultTitle: "Новый чат", // имя диалога, пока бэкенд не придумал своё
} as const;

// Тексты сообщения в треде: состояния ответа, действия и плашка деградации.
export const messageCopy = {
  thinking: "думаю",
  stopped: "ответ остановлен",
  reasoned: "обдуманный ответ",
  // Выгрузка ответа файлом.
  exportTitle: "Скачать ответ",
  exportDocx: "Word (.docx) по ГОСТ",
  exportMd: "Markdown (.md)",
  exportFailed: "Не удалось собрать документ",
  // Имя файла, если сервер не прислал своё (в дев-режиме заголовок может
  // не дойти до JS — см. lib/download.ts).
  exportFallbackName: "Ответ MentorLM",
  // Панель источников под ответом режима «Исследовать».
  sourcesTitle: "Источники",
  sourcesDownload: "Список литературы",
  sourcesBusy: "Готовим…",
  sourcesFallbackName: "Список литературы",
  copy: "Скопировать ответ",
  copied: "Скопировано",
  retry: "Повторить",
  close: "Закрыть",
  // Квота режима исчерпана — ответ дан на упрощённой модели.
  degraded: "Лимит режима исчерпан — отвечаем на упрощённой модели.",
  degradedUpgrade: "Перейти на тариф выше",
  seePlans: "Посмотреть тарифы",
  // Единицы размера вложения.
  bytes: "Б",
  kilobytes: "КБ",
  megabytes: "МБ",
} as const;

// Тексты блока кода в ответе ИИ (CodeBlock.tsx).
export const codeBlockCopy = {
  copy: "Скопировать код",
  copied: "Скопировано",
  // Подпись блока, когда модель не указала ни язык, ни имя файла.
  plain: "код",
  collapse: "Свернуть",
  expand: (lines: number) => `Показать все ${lines} строк`,
  // Цитирование выделенных строк в композер.
  quoteAsk: "Спросить",
  quoteFix: "Исправить",
  quoteLine: (n: number) => `строка ${n}`,
  quoteRange: (from: number, to: number) => `строки ${from}–${to}`,
  quoteHeader: (where: string, span: string) => `Фрагмент (${where}, ${span}):`,
  // Хвост цитаты: после него пользователь дописывает свой текст.
  quoteAskSuffix: "Вопрос: ",
  quoteFixSuffix: "Исправь этот фрагмент: ",
} as const;

// Тексты композера — поля ввода и вложений.
export const composerCopy = {
  // Переключатель «обдумать ответ» рядом с кнопкой отправки.
  thinking: "Обдумать",
  thinkingOn: "Попросить обдумать ответ — дольше, но тщательнее",
  thinkingOff: "Отвечать сразу, без обдумывания",
  thinkingLockedTitle: "Обдумывание доступно на платных тарифах",
  thinkingLocked: "Обдумывание ответа доступно на платных тарифах.",
  thinkingLockedCta: "Посмотреть тарифы",
  attach: "Прикрепить файл",
  send: "Отправить",
  stop: "Остановить ответ",
  removeFile: "Убрать файл",
  fileTooBig: (name: string, mb: number) => `«${name}» больше ${mb} МБ`,
  fileBadFormat: (name: string) => `«${name}» — неподдерживаемый формат`,
  tooManyFiles: (max: number) => `не больше ${max} файлов за раз`,
} as const;

// ── Меню аккаунта ───────────────────────────────────────────────────────────

export const accountMenuCopy = {
  trigger: "Личный кабинет",
  plan: (planLabel: string) => `Тариф ${planLabel}`,
  usage: (modeLabel: string, windowLabel: string) =>
    `${modeLabel} · за ${windowLabel}`,
  upsellTitle: "Больше лимитов и моделей",
  settings: "Настройки",
  subscription: "Подписка и лимиты",
  payments: "Платежи",
  signOut: "Выйти",
} as const;

// ── Ошибки рабочей области ──────────────────────────────────────────────────

// Показываются прямо в треде вместо ответа, поэтому написаны как реплика: что
// случилось и что человек может сделать дальше.
export const chatErrors = {
  emptyAnswer: "Модель не вернула ответ.",
  failed: "Не удалось получить ответ. Проверьте связь и попробуйте снова.",
  createFailed: "Не удалось создать чат.",
} as const;
