/**
 * Ключи localStorage для настроек и их очистка.
 *
 * Отдельный модуль, а не часть SettingsProvider, по одной причине: чистить
 * настройки нужно при выходе, то есть из AuthProvider, а SettingsProvider
 * тянет за собой api.ts, который тянет обратно AuthProvider. Импорт провайдера
 * из провайдера замкнул бы цикл; значения, которые нужны обоим, живут здесь.
 */

// Тема и размер шрифта — настройки УСТРОЙСТВА: их читает анти-FOUC скрипт в
// src/app/layout.tsx до гидратации, и при выходе они намеренно остаются.
export const THEME_STORAGE_KEY = "mentorlm-theme";
export const FONT_STORAGE_KEY = "mentorlm-font-size";

// А это — настройки АККАУНТА: имя, род занятий, рассказ о себе.
export const SETTINGS_STORAGE_KEY = "mentorlm-settings";
export const DEFAULTS_STORAGE_KEY = "mentorlm-settings-defaults";

/**
 * Стирает личные настройки при выходе из аккаунта.
 *
 * Тему и шрифт не трогаем: сбрасывать их на экране входа значит моргнуть белым
 * в тёмной комнате. Всё остальное на общем компьютере оставаться не должно.
 */
export function clearStoredSettings(): void {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    localStorage.removeItem(DEFAULTS_STORAGE_KEY);
  } catch {
    /* localStorage недоступен — очищать нечего. */
  }
}
