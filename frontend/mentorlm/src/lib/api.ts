"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useMemo } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function useApi() {
  const { getToken } = useAuth();

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
        const text = await res.text().catch(() => "");
        throw new ApiError(res.status, text || res.statusText);
      }

      // 204 No Content — без тела.
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [getToken],
  );

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
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        // Без Accept: text/event-stream — иначе DRF (только JSON-рендерер)
        // отдаёт 406 на этапе согласования формата ещё до обработчика.
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: options.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new ApiError(res.status, text || res.statusText);
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
