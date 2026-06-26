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

  return useMemo(
    () => ({
      get: <T = unknown>(path: string) => request<T>(path),
      patch: <T = unknown>(path: string, body: unknown) =>
        request<T>(path, { method: "PATCH", body }),
      post: <T = unknown>(path: string, body: unknown) =>
        request<T>(path, { method: "POST", body }),
    }),
    [request],
  );
}
