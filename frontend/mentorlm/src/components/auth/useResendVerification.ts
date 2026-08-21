/**
 * Повторная отправка письма с подтверждением почты.
 *
 * Вынесено в хук, потому что мест, где это нужно, стало два: полоса-напоминание
 * в приложении и экран оформления подписки. Состояния у них общие, вид — разный,
 * поэтому хук отдаёт только состояние и действие, ничего не рисуя.
 */

"use client";

import { useCallback, useState } from "react";
import { useApi } from "@/lib/api";
import { authContents } from "@/lib/auth-contents";

type State = "idle" | "sending" | "sent";

export function useResendVerification() {
  const api = useApi();
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  const resend = useCallback(async () => {
    // Повторный клик, пока запрос в полёте, съел бы лимит писем впустую.
    if (state !== "idle") return;
    setState("sending");
    setError(null);
    try {
      await api.post("/api/auth/verify-email/request/", {});
      setState("sent");
    } catch (err) {
      // Чаще всего это 429 «письмо уже отправлено» — у бэкенда там осмысленный
      // русский текст, показываем его как есть.
      setError(err instanceof Error ? err.message : authContents.errors.unknown);
      setState("idle");
    }
  }, [api, state]);

  return { state, error, resend };
}
