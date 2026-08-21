/**
 * HTTP-клиент фронтенда к Django-бэкенду.
 * Хук useApi() отдаёт get/post/patch/delete и stream() для SSE-ответов ИИ,
 * автоматически подставляя access-токен в заголовок Authorization.
 * Используется везде, где нужны данные с бэка (чат, настройки, память, тарифы).
 *
 * Здесь же — политика устойчивости: повтор безопасных запросов при сетевом
 * сбое, один повтор со свежим токеном на 401 и терпимость к битым SSE-событиям.
 */

"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import type { ModeUsage } from "@/components/mainapp/SubscriptionProvider";
import { useCallback, useMemo } from "react";

// Базовый адрес API (из env, без хвостового слэша); дефолт — локальный бэк.
// Именно localhost: с 127.0.0.1 браузер не отправит cookie сессии (см.
// AuthProvider и settings/dev.py).
const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

// Повторяем только идемпотентные запросы (GET): повтор POST создал бы второй
// диалог или второе сообщение. Пауза растёт линейно — сбой обычно короткий.
const GET_RETRIES = 2;
const RETRY_DELAY_MS = 600;

// Ошибка API с HTTP-статусом и машинным кодом лимита от бэка (guard.py).
// code "offline" — до сервера не достучались; "unauthorized" — сессия истекла.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Итог стрима ответа ИИ. Ошибку внутри стрима НЕ бросаем: к этому моменту часть
// ответа уже написана и сохранена на бэке — её нужно показать вместе с
// пояснением, а не потерять. Бросаются только отказы до начала стрима (лимиты,
// сеть, 401), где показывать нечего.
export type StreamResult = {
  /** id сохранённого ответа в БД; null — сохранять было нечего. */
  messageId: number | null;
  /** Ответ выдан на упрощённой модели (квота исчерпана). */
  degraded: boolean;
  /** Показывать ли апселл в плашке деградации. */
  canUpgrade: boolean;
  /** Ответ прерван пользователем — это не ошибка. */
  stopped: boolean;
  /** Текст ошибки от бэка, если ответ не дописан. */
  error: string | null;
  /** Свежий расход режима сразу после списания (см. mode_usage_report). */
  usage: ModeUsage | null;
};

// Собирает ApiError из тела ответа: у лимитов бэк отдаёт JSON {code, message}.
async function apiErrorFrom(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => "");
  try {
    const data = JSON.parse(text) as { code?: string; message?: string };
    if (data && (data.message || data.code)) {
      return new ApiError(res.status, data.message || res.statusText, data.code);
    }
  } catch {
    // тело не JSON — вернём как обычную ошибку ниже
  }
  return new ApiError(res.status, text || res.statusText);
}

const offlineError = () =>
  new ApiError(0, "Нет связи с сервером. Проверьте интернет.", "offline");

const expiredError = () =>
  new ApiError(401, "Сессия истекла — обновите страницу и войдите заново.", "unauthorized");

// Главный хук доступа к API: собирает запросы с токеном сессии.
export function useApi() {
  const { getToken } = useAuth();

  // Один сетевой вызов с токеном. fresh=true — просим провайдер сессии
  // обновить токен (нужно ровно один раз, когда бэк ответил 401 на протухший).
  const send = useCallback(
    async (
      path: string,
      init: { method: string; body?: unknown; signal?: AbortSignal },
      fresh = false,
    ): Promise<Response> => {
      const token = await getToken(fresh);
      const isForm = init.body instanceof FormData;
      return fetch(`${API_URL}${path}`, {
        method: init.method,
        // С вложениями шлём multipart — Content-Type не ставим сами, браузер
        // добавит boundary. Заголовок Accept намеренно не ставим: DRF (только
        // JSON-рендерер) иначе вернёт 406 ещё до обработчика.
        headers: {
          ...(isForm ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:
          init.body === undefined
            ? undefined
            : isForm
              ? (init.body as FormData)
              : JSON.stringify(init.body),
        signal: init.signal,
      });
    },
    [getToken],
  );

  // Запрос с политикой устойчивости: обновление токена на 401 и повтор
  // безопасных запросов при сетевом сбое/5xx.
  const fetchResilient = useCallback(
    async (
      path: string,
      init: { method: string; body?: unknown; signal?: AbortSignal },
    ): Promise<Response> => {
      const retries = init.method === "GET" ? GET_RETRIES : 0;
      let lastError: ApiError = offlineError();

      for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt) await sleep(RETRY_DELAY_MS * attempt);
        let res: Response;
        try {
          res = await send(path, init);
        } catch (err) {
          // Прерывание пользователем — не сетевой сбой, наверх как есть.
          if (init.signal?.aborted) throw err;
          lastError = offlineError();
          continue; // сети нет — пробуем ещё раз (для GET)
        }
        // Токен протух — повторяем ровно один раз со свежим.
        if (res.status === 401) {
          const retried = await send(path, init, true).catch(() => null);
          if (!retried) throw offlineError();
          if (retried.status === 401) throw expiredError();
          return retried;
        }
        // 5xx у GET считаем временным сбоем и пробуем ещё раз.
        if (res.status >= 500 && attempt < retries) {
          lastError = await apiErrorFrom(res);
          continue;
        }
        return res;
      }
      throw lastError;
    },
    [send],
  );

  // Базовый запрос: парсит JSON, кидает ApiError на !ok.
  const request = useCallback(
    async <T = unknown>(
      path: string,
      options: { method?: string; body?: unknown } = {},
    ): Promise<T> => {
      const res = await fetchResilient(path, {
        method: options.method ?? "GET",
        body: options.body,
      });

      if (!res.ok) throw await apiErrorFrom(res);

      // 204 No Content — тела нет.
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [fetchResilient],
  );

  // Стриминг ответа ИИ: читает SSE и отдаёт токены через onDelta.
  const stream = useCallback(
    async (
      path: string,
      body: unknown,
      options: {
        onDelta?: (delta: string) => void;
        signal?: AbortSignal;
      } = {},
    ): Promise<StreamResult> => {
      const res = await fetchResilient(path, {
        method: "POST",
        body,
        signal: options.signal,
      });

      if (!res.ok || !res.body) {
        throw await apiErrorFrom(res);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let messageId: number | null = null;
      let degraded = false; // квота исчерпана — ответ на упрощённой модели
      let canUpgrade = false; // показывать ли апселл в плашке деградации
      let stopped = false; // ответ остановлен пользователем
      let error: string | null = null;
      let usage: ModeUsage | null = null;

      // SSE: события разделены пустой строкой, данные — в строках `data: {...}`.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);

          for (const line of rawEvent.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            // Битое событие пропускаем: одна повреждённая строка не должна
            // обрывать весь ответ, который в остальном приходит нормально.
            let payload: {
              delta?: string;
              done?: boolean;
              message_id?: number | null;
              stopped?: boolean;
              error?: string | null;
              degraded?: boolean;
              can_upgrade?: boolean;
              usage?: ModeUsage | null;
            };
            try {
              payload = JSON.parse(json);
            } catch {
              continue;
            }
            if (payload.error) error = payload.error;
            if (payload.degraded) {
              degraded = true;
              canUpgrade = !!payload.can_upgrade;
            }
            if (payload.delta) options.onDelta?.(payload.delta);
            if (payload.done) {
              messageId = payload.message_id ?? null;
              stopped = !!payload.stopped;
              usage = payload.usage ?? null;
            }
          }
        }
      }

      return { messageId, degraded, canUpgrade, stopped, error, usage };
    },
    [fetchResilient],
  );

  // Готовый набор методов, стабильный по ссылке между рендерами.
  return useMemo(
    () => ({
      get: <T = unknown>(path: string) => request<T>(path),
      patch: <T = unknown>(path: string, body: unknown) =>
        request<T>(path, { method: "PATCH", body }),
      post: <T = unknown>(path: string, body: unknown) =>
        request<T>(path, { method: "POST", body }),
      delete: <T = unknown>(path: string) =>
        request<T>(path, { method: "DELETE" }),
      stream,
    }),
    [request, stream],
  );
}
