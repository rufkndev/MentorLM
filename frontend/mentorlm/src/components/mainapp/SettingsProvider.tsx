/**
 * Провайдер пользовательских настроек (тема, шрифт, предпочтения ИИ, память).
 * Читает/пишет /api/me/settings/, кэширует их в localStorage для мгновенного
 * старта, применяет тему и размер шрифта к <html>, а обновления шлёт на бэк
 * дебаунс-PATCH'ем. Потребители — диалог настроек и весь UI через useSettings().
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useApi } from "@/lib/api";
import type {
  ContextDepth,
  Creativity,
  EducationLevel,
  LengthPref,
  MemoryScope,
  MemoryUse,
  ModelTier,
  ReasoningDepth,
  RetentionDays,
} from "@/lib/settings-contents";

// Тип настроек — зеркало UserSettingsSerializer на бэке.
export type Theme = "system" | "light" | "dark";
export type FontSize = "sm" | "md" | "lg";

export type Settings = {
  // внешний вид / поведение
  theme: Theme;
  font_size: FontSize;
  // модель ИИ (мягкие предпочтения поверх сценария)
  chat_model: ModelTier;
  code_model: ModelTier;
  research_model: ModelTier;
  creativity: Creativity;
  response_length_preference: LengthPref;
  reasoning_depth: ReasoningDepth;
  // память / персональные инструкции
  nickname: string;
  occupation: string;
  education_level: EducationLevel;
  field_of_study: string;
  learning_goals: string;
  custom_about: string;
  custom_style: string;
  context_depth: ContextDepth;
  auto_memory: boolean;
  memory_scope: MemoryScope;
  memory_use: MemoryUse;
  // данные
  chat_retention_days: RetentionDays;
};

// Значения по умолчанию = дефолты бэка (apps/ai/preferences.py DEFAULTS).
const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  font_size: "md",
  chat_model: "default",
  code_model: "default",
  research_model: "default",
  creativity: "balanced",
  response_length_preference: "default",
  reasoning_depth: "auto",
  nickname: "",
  occupation: "",
  education_level: "",
  field_of_study: "",
  learning_goals: "",
  custom_about: "",
  custom_style: "",
  context_depth: "normal",
  auto_memory: true,
  memory_scope: "balanced",
  memory_use: "auto",
  chat_retention_days: 0,
};

// Ключи localStorage для темы, шрифта и полного объекта настроек.
const THEME_STORAGE_KEY = "mentorlm-theme";
const FONT_STORAGE_KEY = "mentorlm-font-size";
const SETTINGS_STORAGE_KEY = "mentorlm-settings";

// Синхронно читает закэшированные настройки (на сервере — дефолты).
function readCachedSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Применение темы/шрифта к <html>

// Разворачивает "system" в реальную тему по системной настройке.
function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }
  return theme;
}

// Ставит выбранную тему на <html> (атрибут data-theme).
function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(theme));
}

// Ставит размер шрифта чата на <html> (атрибут data-font-size).
function applyFontSize(size: FontSize) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-font-size", size);
}

type SettingsContextValue = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void; // оптимистично + дебаунс-PATCH
  loading: boolean;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

// Провайдер: держит настройки, синхронизирует с бэком и применяет тему/шрифт.
export function SettingsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  // Стартуем сразу с закэшированных настроек — без вспышки дефолтов.
  const [settings, setSettings] = useState<Settings>(readCachedSettings);
  const [loading, setLoading] = useState(true);

  // Любое изменение настроек зеркалим в кэш — следующий вход будет мгновенным.
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* localStorage недоступен (приватный режим) — не критично. */
    }
  }, [settings]);

  // Накопитель изменений для дебаунса PATCH.
  const pendingRef = useRef<Partial<Settings>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Загрузка настроек с бэка при монтировании (бэк — источник правды).
  useEffect(() => {
    let cancelled = false;
    api
      .get<Settings>("/api/me/settings/")
      .then((data) => {
        if (cancelled) return;
        const merged = { ...DEFAULT_SETTINGS, ...data };
        setSettings(merged);
        // Бэк — источник правды: синхронизируем localStorage и применяем.
        localStorage.setItem(THEME_STORAGE_KEY, merged.theme);
        localStorage.setItem(FONT_STORAGE_KEY, merged.font_size);
        applyTheme(merged.theme);
        applyFontSize(merged.font_size);
      })
      .catch(() => {
        // Не залогинен / бэк недоступен — остаёмся на localStorage/дефолтах.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Если тема = system — реагируем на смену системной темы на лету.
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme]);

  // Отправляет накопленные изменения одним PATCH на бэк.
  const flush = useCallback(() => {
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length === 0) return;
    api.patch("/api/me/settings/", patch).catch(() => {
      // Сетевой сбой не откатываем в MVP — значение уже применено локально.
    });
  }, [api]);

  // Частичное обновление настроек: локально сразу, на бэк — дебаунсом.
  const update = useCallback(
    (patch: Partial<Settings>) => {
      // 1) оптимистичное локальное обновление
      setSettings((prev) => ({ ...prev, ...patch }));

      // 2) мгновенно применяем «визуальные» настройки + localStorage
      if (patch.theme !== undefined) {
        localStorage.setItem(THEME_STORAGE_KEY, patch.theme);
        applyTheme(patch.theme);
      }
      if (patch.font_size !== undefined) {
        localStorage.setItem(FONT_STORAGE_KEY, patch.font_size);
        applyFontSize(patch.font_size);
      }

      // 3) копим и дебаунсим PATCH на бэк
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 600);
    },
    [flush],
  );

  // Досылаем накопленный PATCH при размонтировании.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      flush();
    };
  }, [flush]);

  return (
    <SettingsContext.Provider value={{ settings, update, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}

// Доступ к настройкам и функции их обновления.
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within <SettingsProvider>");
  }
  return ctx;
}
