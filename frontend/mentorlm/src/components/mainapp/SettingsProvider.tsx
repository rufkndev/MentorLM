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

/* ── Тип настроек (зеркало UserSettingsSerializer на бэке) ── */
export type Theme = "system" | "light" | "dark";
export type FontSize = "sm" | "md" | "lg";
export type ResponseLength = "short" | "balanced" | "detailed";

export type Settings = {
  theme: Theme;
  interface_lang: string;
  font_size: FontSize;
  show_suggestions: boolean;
  auto_scroll: boolean;
  default_model: string;
  temperature: number;
  response_length: ResponseLength;
  context_size: string;
  streaming: boolean;
  web_search: boolean;
  nickname: string;
  occupation: string;
  custom_about: string;
  custom_style: string;
  auto_memory: boolean;
};

/* Значения по умолчанию = дефолты модели UserSettings. */
export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  interface_lang: "ru",
  font_size: "md",
  show_suggestions: true,
  auto_scroll: true,
  default_model: "mentor-pro",
  temperature: 0.7,
  response_length: "balanced",
  context_size: "20",
  streaming: true,
  web_search: false,
  nickname: "",
  occupation: "",
  custom_about: "",
  custom_style: "",
  auto_memory: true,
};

export const THEME_STORAGE_KEY = "mentorlm-theme";
export const FONT_STORAGE_KEY = "mentorlm-font-size";
/** Кэш всего объекта настроек — для мгновенной отрисовки без задержки на сеть. */
export const SETTINGS_STORAGE_KEY = "mentorlm-settings";

/* Синхронно читаем закэшированные настройки (stale-while-revalidate).
   На сервере window нет — отдаём дефолты; диалог настроек всё равно не
   рендерится при SSR, так что рассинхрона гидратации не возникает. */
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

/* ── Применение темы/шрифта к <html> ── */
function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }
  return theme;
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(theme));
}

function applyFontSize(size: FontSize) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-font-size", size);
}

/* ── Контекст ── */
type SettingsContextValue = {
  settings: Settings;
  /** Частичное обновление: оптимистично + дебаунс-PATCH на бэк. */
  update: (patch: Partial<Settings>) => void;
  loading: boolean;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

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

  /* Загрузка настроек с бэка при монтировании. */
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

  /* Если тема = system — реагируем на смену системной темы. */
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme]);

  const flush = useCallback(() => {
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length === 0) return;
    api.patch("/api/me/settings/", patch).catch(() => {
      // Сетевой сбой не откатываем в MVP — значение уже применено локально.
    });
  }, [api]);

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

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within <SettingsProvider>");
  }
  return ctx;
}
