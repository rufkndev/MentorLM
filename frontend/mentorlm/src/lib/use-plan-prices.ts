/**
 * Цены тарифов с бэкенда — чтобы менять их в одном месте.
 *
 * Единственный источник правды о цене — `PLAN_PRICE_RUB` в
 * `backend/apps/billing/limits.py` (там же читаются переменные окружения
 * `PLAN_PRICE_PLUS` / `PLAN_PRICE_PRO`). Списывается всегда именно она.
 *
 * Числа в `billing-contents.ts` остаются, но играют роль запасных: страница
 * тарифов должна отрисоваться мгновенно и пережить недоступный API. Если бы
 * фронт хранил цену как основную, однажды на витрине было бы 1499, а
 * списывалось 990 — и правым в споре оказался бы не мы.
 *
 * Запрос без токена: цены публичны, страница тарифов открыта и гостям.
 */

"use client";

import { useEffect, useState } from "react";

export type PlanId = "free" | "plus" | "pro";

type PlanPrice = { id: PlanId; label: string; price: number; currency: string };

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

// Цены меняются раз в полгода — держим ответ в памяти вкладки, чтобы каждая
// карточка тарифа не ходила в сеть отдельно.
let cache: Record<string, number> | null = null;

export function usePlanPrices(): Record<string, number> | null {
  const [prices, setPrices] = useState<Record<string, number> | null>(cache);

  useEffect(() => {
    if (cache) return;
    let alive = true;
    fetch(`${API_URL}/api/billing/plans/`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { plans: PlanPrice[] }) => {
        const map = Object.fromEntries(data.plans.map((p) => [p.id, p.price]));
        cache = map;
        if (alive) setPrices(map);
      })
      // Молча: на витрине останутся запасные цены из billing-contents, и это
      // лучше пустого места. Реальную цену человек всё равно увидит на форме
      // оплаты ЮKassa до того, как подтвердит списание.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return prices;
}

/** Цена тарифа: с бэкенда, если ответ уже пришёл, иначе — запасная. */
export function priceOf(
  planId: string,
  fallback: number | null,
  prices: Record<string, number> | null,
): number {
  return prices?.[planId] ?? fallback ?? 0;
}
