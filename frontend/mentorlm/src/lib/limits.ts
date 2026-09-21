/**
 * Клиентские потолки длины — зеркало бэкенда.
 *
 * Это НЕ защита: maxLength в разметке снимается в один клик в инструментах
 * разработчика, а настоящая проверка всегда на сервере. Смысл этих чисел —
 * подсказать человеку границу до отправки, а не после отказа.
 *
 * ⚠️ Каждое число дублирует константу бэкенда (файл указан рядом). Менять
 * нужно оба места разом — как DEFAULTS / DEFAULT_SETTINGS.
 */

// Потолки длины свободных полей «о себе».
// Зеркало PERSONA_LIMITS из backend/mentorlm/apps/ai/preferences.py.
export const PERSONA_LIMITS = {
  nickname: 50,
  occupation: 100,
  field_of_study: 120,
  learning_goals: 600,
  custom_about: 1500,
  custom_style: 1000,
} as const;

// Потолок одного сообщения в чате.
// Зеркало MAX_MESSAGE_CHARS из backend/mentorlm/apps/billing/limits.py.
export const MAX_MESSAGE_CHARS = 400_000;

// Потолок названия чата при переименовании.
// Зеркало TITLE_MAX_CHARS из backend/mentorlm/apps/conversations/serializers.py.
export const MAX_TITLE_CHARS = 120;

// Вложения к сообщению: сколько файлов за раз и потолок одного файла.
//
// ⚠️ MAX_FILES здесь — не то же самое, что на бэкенде: там потолок зависит от
// тарифа (`max_attachments` в apps/billing/limits.py — 0 / 5 / 10), а жёсткий
// предел MAX_FILES_HARD = 10 (apps/conversations/attachments.py). Клиент
// показывает одно число для всех, поэтому на Pro он строже сервера.
export const MAX_FILES = 5;
export const MAX_FILE_MB = 10;
