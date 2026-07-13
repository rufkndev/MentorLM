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
  daily_messages: number | null;
};
export type UsageLine = { used: number; limit: number | null };
export type UsageInfo = {
  plan: string;
  plan_label: string;
  monthly: { used_pct: number; remaining_pct: number; resets_at: string };
  daily: {
    messages: UsageLine;
    research: UsageLine;
    code: UsageLine;
    resets_at: string;
  };
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
