/**
 * Типы значений пользовательских настроек.
 *
 * Это КОНТРАКТ с бэкендом: ровно эти строковые коды принимает
 * UserSettingsSerializer и раскладывает в параметры генерации
 * (apps/ai/preferences.py). Подписи к ним — в content/settings.ts.
 *
 * ⚠️ Менять значения только вместе с бэкендом.
 */

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
export type Option<T extends string | number> = { value: T; label: string };
