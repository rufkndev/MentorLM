"use client";

import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Section } from "../controls";
import { useSubscriptionUsage, type ModeUsage } from "../hooks";

// Когда квота начнёт восстанавливаться, в человекочитаемом виде.
function formatReset(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const diffMs = new Date(resetsAt).getTime() - Date.now();
  if (diffMs <= 0) return "скоро";
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 1) return "менее чем через час";
  if (hours < 24) return `через ~${hours} ч`;
  return `через ~${Math.round(hours / 24)} дн`;
}

// Полоска расхода одного режима: доля исчерпанной квоты + время восстановления.
function ModeUsageBar({ mode }: { mode: ModeUsage }) {
  const usedPct = mode.used_pct;
  const reset = usedPct > 0 ? formatReset(mode.resets_at) : null;
  return (
    <div>
      <div className="flex items-center justify-between text-[12.5px] text-muted">
        <span>{mode.label}</span>
        <span>Осталось {mode.remaining_pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-[var(--brand-primary)] transition-all"
          style={{ width: `${usedPct}%` }}
        />
      </div>
      {reset && (
        <p className="mt-1 text-[11px] text-muted">Обновится {reset}</p>
      )}
    </div>
  );
}

export function SubscriptionTab() {
  const { sub, usage } = useSubscriptionUsage();

  const planLabel = usage?.plan_label ?? sub?.plan_label ?? "Free";

  return (
    <Section title="Подписка">
      <div className="rounded-2xl border border-line bg-paper-2/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Текущий план
            </p>
            <p className="mt-1 text-[20px] font-semibold text-ink">{planLabel}</p>
          </div>
          <span className="rounded-full bg-surface px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted ring-1 ring-line">
            {planLabel}
          </span>
        </div>

        {usage && (
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Использование
            </p>
            <ModeUsageBar mode={usage.modes.chat} />
            <ModeUsageBar mode={usage.modes.code} />
            <ModeUsageBar mode={usage.modes.research} />
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
          Максимальные модели, память и веб-поиск
        </p>
        <ul className="mt-3 space-y-1.5 text-[13px] text-ink-soft">
          {[
            "Максимальное качество моделей",
            "Веб-поиск в режиме «Исследовать»",
            "Глобальная память между диалогами",
            "Память диалога и вложения",
            "Увеличенные лимиты запросов",
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
            <span className="text-[18px] font-semibold">1499 ₽</span>
            <span className="text-muted"> / месяц</span>
          </p>
          <Link
            href="/billing"
            className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-[var(--brand-primary-hover)]"
          >
            Улучшить тариф
          </Link>
        </div>
      </div>
    </Section>
  );
}
