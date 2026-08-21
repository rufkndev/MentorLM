/**
 * Провайдер тарифа пользователя: одна загрузка /api/me/subscription/ и
 * /api/me/usage/ на всё приложение. Тариф нужен в нескольких местах сразу
 * (подвал сайдбара, вкладка «Подписка»), и все они должны показывать одно и то
 * же — иначе апселл висит у тех, у кого тариф уже платный.
 *
 * Бэк — источник правды: план считается из живой подписки (billing.plans).
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useApi } from "@/lib/api";

export type Plan = "free" | "plus" | "pro";

export type SubscriptionInfo = {
  plan: Plan;
  plan_label: string;
  status: string;
  provider: string | null;
  current_period_end: string | null;
  allow_web_search: boolean;
  allow_memory: boolean;
  context_messages: number;
  max_attachments: number;
};

export type UsageWindowKey = "burst" | "week";

// Одно скользящее окно квоты режима: доля исчерпанного, подпись окна и точный
// момент, с которого лимит начнёт восстанавливаться (ISO с бэка).
export type UsageWindow = {
  used_pct: number;
  remaining_pct: number;
  resets_at: string | null;
  window_label: string;
};

// Расход режима: оба окна по отдельности плюс поднятое наверх самое забитое из
// них (см. mode_usage_report на бэке).
export type ModeUsage = UsageWindow & {
  label: string;
  /** Самое забитое окно — оно упрётся первым. */
  tightest_window: UsageWindowKey;
  windows: { burst: UsageWindow; week: UsageWindow };
};

export type UsageMode = "chat" | "code" | "research";

export type UsageInfo = {
  plan: Plan;
  plan_label: string;
  modes: Record<UsageMode, ModeUsage>;
};

type SubscriptionContextValue = {
  sub: SubscriptionInfo | null;
  usage: UsageInfo | null;
  /** Действующий тариф; до ответа бэка — null (апселл до этого не показываем). */
  plan: Plan | null;
  /** Тариф платный — апселл «перейти на платный» больше не нужен. */
  isPaid: boolean;
  /** Верхний тариф — расти некуда, апселла нет вообще. */
  isTop: boolean;
  refresh: () => void;
  /** Перечитать только расход — дёшево и часто (после каждого ответа ИИ). */
  refreshUsage: () => void;
  /** Подставить расход режима, пришедший вместе с концом ответа (без запроса). */
  applyModeUsage: (mode: string, data: ModeUsage) => void;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

// Как часто перечитывать расход, пока вкладка открыта и активна. Окна квот
// скользящие, поэтому проценты меняются и без наших запросов (лимит
// восстанавливается сам) — редкий фоновый опрос держит цифры честными.
const USAGE_POLL_MS = 60_000;

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  // Расход обновляется отдельно от тарифа: он меняется после каждого ответа
  // модели, а подписка — раз в месяц.
  const refreshUsage = useCallback(() => {
    api.get<UsageInfo>("/api/me/usage/").then(setUsage).catch(() => {});
  }, [api]);

  const refresh = useCallback(() => {
    api.get<SubscriptionInfo>("/api/me/subscription/").then(setSub).catch(() => {});
    refreshUsage();
  }, [api, refreshUsage]);

  // Расход режима приходит прямо в последнем событии ответа — бэк отдаёт его
  // уже после списания. Подставляем без запроса: шкала обновляется в тот же
  // момент, когда ответ дописан, и не зависит от гонки с фоновым опросом.
  const applyModeUsage = useCallback((mode: string, data: ModeUsage) => {
    setUsage((prev) =>
      prev && mode in prev.modes
        ? { ...prev, modes: { ...prev.modes, [mode]: data } }
        : prev,
    );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Фоновое обновление расхода: по таймеру, при возврате на вкладку и при
  // восстановлении связи. В скрытой вкладке сеть не дёргаем.
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) refreshUsage();
    };
    const timer = setInterval(tick, USAGE_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
      window.removeEventListener("focus", tick);
    };
  }, [refreshUsage]);

  // Пока бэк не ответил — план неизвестен (null), а не «free»: иначе платному
  // пользователю на долю секунды мигал бы апселл.
  const plan = sub?.plan ?? usage?.plan ?? null;

  // Значение мемоизируем: расход перечитывается часто, и без этого каждый его
  // приход менял бы ссылки на refresh* у всех потребителей.
  const value = useMemo<SubscriptionContextValue>(
    () => ({
      sub,
      usage,
      plan,
      isPaid: plan === "plus" || plan === "pro",
      isTop: plan === "pro",
      refresh,
      refreshUsage,
      applyModeUsage,
    }),
    [sub, usage, plan, refresh, refreshUsage, applyModeUsage],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// Пустое состояние вне провайдера — константа, чтобы ссылки не менялись между
// рендерами (иначе useCallback у потребителей пересоздавался бы каждый раз).
const EMPTY: SubscriptionContextValue = {
  sub: null,
  usage: null,
  plan: null,
  isPaid: false,
  isTop: false,
  refresh: () => {},
  refreshUsage: () => {},
  applyModeUsage: () => {},
};

// Доступ к тарифу и расходу. Вне провайдера (напр. на лендинге) — пустое
// состояние с неизвестным планом, чтобы компонент не падал.
export function useSubscription(): SubscriptionContextValue {
  return useContext(SubscriptionContext) ?? EMPTY;
}
