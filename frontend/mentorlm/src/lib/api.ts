/**
 * HTTP-клиент фронтенда к Django-бэкенду.
 * Хук useApi() отдаёт get/post/patch/delete и stream() для SSE-ответов ИИ,
 * автоматически подставляя Clerk-токен в заголовок Authorization.
 * Используется везде, где нужны данные с бэка (чат, настройки, память, тарифы).
 */

"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useMemo } from "react";

// Базовый адрес API (из env, без хвостового слэша); дефолт — локальный бэк.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

// Ошибка API с HTTP-статусом и машинным кодом лимита от бэка (guard.py).
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

// Главный хук доступа к API: собирает запросы с токеном Clerk.
export function useApi() {
  const { getToken } = useAuth();

  // Базовый запрос: подставляет токен, парсит JSON, кидает ApiError на !ok.
  const request = useCallback(
    async <T = unknown>(
      path: string,
      options: { method?: string; body?: unknown } = {},
    ): Promise<T> => {
      const token = await getToken();
      const res = await fetch(`${API_URL}${path}`, {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!res.ok) {
        throw await apiErrorFrom(res);
      }

      // 204 No Content — тела нет.
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [getToken],
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
    ): Promise<{ messageId: number | null }> => {
      const token = await getToken();
      // С вложениями шлём multipart (FormData) — Content-Type не ставим сами,
      // браузер добавит boundary. Без файлов — как раньше, JSON.
      const isForm = body instanceof FormData;
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        // Заголовок Accept намеренно не ставим: DRF (только JSON-рендерер)
        // иначе вернёт 406 на согласовании формата ещё до обработчика.
        headers: {
          ...(isForm ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: isForm ? body : JSON.stringify(body),
        signal: options.signal,
      });

      if (!res.ok || !res.body) {
        throw await apiErrorFrom(res);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let messageId: number | null = null;

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
            const payload = JSON.parse(json) as {
              delta?: string;
              done?: boolean;
              message_id?: number | null;
              error?: string;
            };
            if (payload.error) throw new ApiError(500, payload.error);
            if (payload.delta) options.onDelta?.(payload.delta);
            if (payload.done) messageId = payload.message_id ?? null;
          }
        }
      }

      return { messageId };
    },
    [getToken],
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
