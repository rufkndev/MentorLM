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

// Тариф и расход живут в SubscriptionProvider — он один на всё приложение,
// чтобы сайдбар и вкладка «Подписка» не расходились (см. useSubscription).
