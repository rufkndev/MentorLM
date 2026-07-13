"use client";

import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Section } from "../controls";
import { useSubscriptionUsage, type UsageLine } from "../hooks";

function DailyUsageRow({ label, line }: { label: string; line: UsageLine }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className="text-muted">{label}</span>
      <span className="text-ink-soft">
        {line.used} / {line.limit === null ? "∞" : line.limit}
      </span>
    </div>
  );
}

export function SubscriptionTab() {
  const { sub, usage } = useSubscriptionUsage();

  const planLabel = usage?.plan_label ?? sub?.plan_label ?? "Free";
  const remainingPct = usage?.monthly.remaining_pct ?? 100;
  const usedPct = usage?.monthly.used_pct ?? 0;

  return (
    <Section title="Подписка">
      <div className="rounded-2xl border border-line bg-paper-2/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Текущий план
            </p>
            <p className="mt-1 text-[20px] font-semibold text-ink">{planLabel}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              Осталось {remainingPct}% месячного лимита
            </p>
          </div>
          <span className="rounded-full bg-surface px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted ring-1 ring-line">
            {planLabel}
          </span>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[12.5px] text-muted">
            <span>Месячный лимит</span>
            <span>{usedPct}% использовано</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-[var(--brand-primary)] transition-all"
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>

        {usage && (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Сегодня
            </p>
            <DailyUsageRow label="Сообщений" line={usage.daily.messages} />
            <DailyUsageRow label="Исследований" line={usage.daily.research} />
            <DailyUsageRow label="Запросов кода" line={usage.daily.code} />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary-soft)]/40 p-5">
        <div className="flex items-center gap-2">
          <Sparkles
            className="h-4 w-4 text-[var(--brand-primary)]"
            strokeWidth={1.7}
          />
          <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--brand-primary)]">
            Mentor Pro
          </p>
        </div>
        <p className="mt-2 text-[18px] font-semibold text-ink">
          Безлимитные чаты и продвинутые модели
        </p>
        <ul className="mt-3 space-y-1.5 text-[13px] text-ink-soft">
          {[
            "До 400 сообщений в день",
            "Максимальная модель без компромиссов",
            "Длинный контекст до 128K токенов",
            "Поиск в интернете",
            "Приоритетная очередь в часы пик",
          ].map((line) => (
            <li key={line} className="flex items-center gap-2">
              <Check
                className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                strokeWidth={2}
              />
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[13px] text-ink">
            <span className="text-muted">от </span>
            <span className="text-[18px] font-semibold">349 ₽</span>
            <span className="text-muted"> / месяц</span>
          </p>
          <Link
            href="/billing"
            className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-[var(--brand-primary-hover)]"
          >
            Перейти на Pro
          </Link>
        </div>
      </div>
    </Section>
  );
}
