"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Section } from "../controls";
import {
  useSubscription,
  type ModeUsage,
  type UsageWindow,
} from "@/components/mainapp/SubscriptionProvider";
import { billingPlans } from "@/lib/billing-contents";

// Точная дата и время, когда лимит начнёт восстанавливаться — в локальной зоне
// пользователя. Сегодня/завтра называем словом, дальше — датой.
function formatResetAt(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return null;

  const time = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(date) - startOfDay(new Date())) / 86_400_000,
  );
  if (days <= 0) return `сегодня в ${time}`;
  if (days === 1) return `завтра в ${time}`;
  const day = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
  return `${day} в ${time}`;
}

// Цвет шкалы включается, только когда остаток реально мал — иначе она спокойная.
function toneFor(remaining: number): string {
  if (remaining <= 10) return "#d4334a";
  if (remaining <= 25) return "#e08a1e";
  return "var(--brand-primary)";
}

// Полоска одного окна квоты: остаток + точное время восстановления.
function WindowBar({ window }: { window: UsageWindow }) {
  const remaining = window.remaining_pct;
  const resetAt = formatResetAt(window.resets_at);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="text-muted">за {window.window_label}</span>
        <span className="font-medium text-ink">Осталось {remaining}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--brand-ink)_9%,transparent)]">
        {/* Ширина — остаток, а не расход: пользователь следит именно за ним.
            Плавный переход делает фоновое обновление заметным, но спокойным. */}
        <div
          className="h-full rounded-full transition-[width,background-color] duration-700 ease-out"
          style={{
            width: `${Math.max(2, remaining)}%`,
            background: toneFor(remaining),
          }}
        />
      </div>
      {resetAt && (
        <p className="mt-1 text-[11px] text-muted">
          Начнёт восстанавливаться {resetAt}
        </p>
      )}
    </div>
  );
}

// Расход одного режима: оба окна квоты по отдельности. Раньше показывалось
// только самое забитое из них, и цифра «прыгала» между 5 часами и неделей —
// причём молча, так что остаток выглядел то упавшим, то восстановившимся.
function ModeUsageBars({ mode }: { mode: ModeUsage }) {
  return (
    <div>
      <p className="text-[12.5px] font-medium text-ink-soft">{mode.label}</p>
      <div className="mt-2 space-y-2.5">
        <WindowBar window={mode.windows.burst} />
        <WindowBar window={mode.windows.week} />
      </div>
    </div>
  );
}

// Дата окончания оплаченного периода — для платных тарифов.
function formatPeriodEnd(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function SubscriptionTab() {
  const { sub, usage, plan, isTop, refreshUsage } = useSubscription();

  // Расход перечитываем при открытии вкладки: пользователь заходит сюда именно
  // затем, чтобы увидеть актуальный остаток, а не цифры на момент загрузки
  // страницы. Дальше его держит свежим фоновое обновление в провайдере.
  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  const planLabel = sub?.plan_label ?? usage?.plan_label ?? "Free";
  const periodEnd = formatPeriodEnd(sub?.current_period_end ?? null);
  // Апселл показываем только тем, кому есть куда расти: на Pro — ничего, на
  // Plus — Pro, на Free — Plus. Пока тариф не загружен (plan === null) — молчим.
  const upsellId = plan === "plus" ? "pro" : plan === "free" ? "plus" : null;
  const upsell = billingPlans.find((p) => p.id === upsellId);

  return (
    <Section title="Подписка">
      <div className="rounded-2xl border border-line bg-paper-2/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Текущий план
            </p>
            <p className="mt-1 text-[20px] font-semibold text-ink">{planLabel}</p>
            {periodEnd && (
              <p className="mt-1 text-[12.5px] text-muted">
                {sub?.status === "canceled"
                  ? `Действует до ${periodEnd}`
                  : `Продление ${periodEnd}`}
              </p>
            )}
          </div>
          <span className="rounded-full bg-surface px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted ring-1 ring-line">
            {planLabel}
          </span>
        </div>

        {usage && (
          <div className="mt-4 space-y-4 border-t border-line pt-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Использование
            </p>
            <ModeUsageBars mode={usage.modes.chat} />
            <ModeUsageBars mode={usage.modes.code} />
            <ModeUsageBars mode={usage.modes.research} />
          </div>
        )}
      </div>

      {/* На верхнем тарифе апселла нет — вместо него подтверждение статуса. */}
      {isTop && (
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-paper-2/30 p-5 text-[13px] text-ink-soft">
          <Sparkles
            className="h-4 w-4 shrink-0 text-[var(--brand-primary)]"
            strokeWidth={1.7}
          />
          У вас максимальный тариф — доступны все модели, веб-поиск, память и
          самые высокие лимиты.
        </div>
      )}

      {upsell && (
        <div className="rounded-2xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary-soft)]/40 p-5">
          <div className="flex items-center gap-2">
            <Sparkles
              className="h-4 w-4 text-[var(--brand-primary)]"
              strokeWidth={1.7}
            />
            <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--brand-primary)]">
              Mentor {upsell.name}
            </p>
          </div>
          <p className="mt-2 text-[18px] font-semibold text-ink">
            {upsell.description}
          </p>
          <ul className="mt-3 space-y-1.5 text-[13px] text-ink-soft">
            {upsell.features.map((line) => (
              <li key={line} className="flex items-center gap-2">
                <Check
                  className="h-3.5 w-3.5 shrink-0 text-[var(--brand-primary)]"
                  strokeWidth={2}
                />
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[13px] text-ink">
              <span className="text-[18px] font-semibold">{upsell.price} ₽</span>
              <span className="text-muted"> / месяц</span>
            </p>
            {/* На страницу тарифов, а не сразу в оплату: сравнить планы — часть
                решения, и с Plus должен быть виден не только Pro. */}
            <Link
              href="/billing"
              className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-[var(--brand-primary-hover)]"
            >
              Перейти на {upsell.name}
            </Link>
          </div>
        </div>
      )}
    </Section>
  );
}
