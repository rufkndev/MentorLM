/*
 * API-состояние диалога настроек, отделённое от UI: каждая вкладка, которой
 * нужны данные с бэка, берёт готовый хук и не занимается загрузкой сама.
 */

"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";

// долговременная память

export type MemoryFact = { id: number; content: string; created_at: string };

export function useMemoryFacts() {
  const api = useApi();
  const [facts, setFacts] = useState<MemoryFact[] | null>(null);

  useEffect(() => {
    api
      .get<MemoryFact[]>("/api/memory/facts/")
      .then(setFacts)
      .catch(() => setFacts([]));
  }, [api]);

  const clearAll = () => {
    setFacts([]);
    api.delete("/api/memory/facts/").catch(() => {});
  };
  const removeOne = (id: number) => {
    setFacts((prev) => prev?.filter((f) => f.id !== id) ?? null);
    api.delete(`/api/memory/facts/${id}/`).catch(() => {});
  };

  return { facts, clearAll, removeOne };
}

// подписка и использование

export type SubscriptionInfo = {
  plan: string;
  plan_label: string;
  status: string;
  provider: string | null;
  current_period_end: string | null;
  allow_web_search: boolean;
  allow_memory: boolean;
  context_messages: number;
  max_attachments: number;
};
// Одно скользящее окно квоты режима: доля исчерпанного + момент восстановления.
export type UsageWindow = { used_pct: number; resets_at: string | null };
export type ModeUsage = {
  label: string;
  used_pct: number;
  remaining_pct: number;
  tightest_window: "burst" | "week";
  resets_at: string | null;
  windows: { burst: UsageWindow; week: UsageWindow };
};
export type UsageInfo = {
  plan: string;
  plan_label: string;
  modes: { chat: ModeUsage; code: ModeUsage; research: ModeUsage };
};

export function useSubscriptionUsage() {
  const api = useApi();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  useEffect(() => {
    // read-only индикаторы ЛК: тариф и сегодняшнее использование с бэка.
    api.get<SubscriptionInfo>("/api/me/subscription/").then(setSub).catch(() => {});
    api.get<UsageInfo>("/api/me/usage/").then(setUsage).catch(() => {});
  }, [api]);

  return { sub, usage };
}
