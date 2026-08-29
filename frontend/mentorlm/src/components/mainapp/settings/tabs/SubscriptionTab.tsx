/*
 * Вкладка «Подписка»: тариф, расход по режимам и управление автопродлением.
 *
 * Управление здесь — это исполнение п. 7.4 оферты и ст. 16.1 ЗоЗПП: отказ от
 * автосписаний должен приниматься в личном кабинете, без объяснения причин,
 * без звонков и без обращения к третьим лицам. Отсюда три следствия в UI:
 * кнопка отключения не спрятана за апселлом, подтверждение не уговаривает
 * остаться, а после отказа прямо написано, до какой даты сохраняется доступ
 * (п. 7.7). Удаление привязанной карты — второй названный в оферте способ
 * отказа, поэтому оно тоже здесь, а не «по запросу в поддержку».
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import { Section } from "../controls";
import {
  useSubscription,
  type ModeUsage,
  type UsageWindow,
} from "@/components/mainapp/SubscriptionProvider";
import { ApiError, useApi } from "@/lib/api";
import { billingPlans } from "@/lib/billing-contents";
import { priceOf, usePlanPrices } from "@/lib/use-plan-prices";

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

// Управление автопродлением и привязанной картой.
function AutoRenewControls() {
  const api = useApi();
  const { sub, refresh } = useSubscription();
  const [busy, setBusy] = useState<null | "cancel" | "resume" | "card">(null);
  const [error, setError] = useState<string | null>(null);
  // Подтверждение только на отключение — там человек теряет доступ в будущем.
  // На включение подтверждения нет: это не опасное действие.
  const [confirming, setConfirming] = useState(false);

  if (!sub || sub.status === "none" || sub.plan === "free") return null;

  const until = formatPeriodEnd(sub.current_period_end);

  async function run(action: "cancel" | "resume" | "card") {
    setBusy(action);
    setError(null);
    try {
      if (action === "cancel") await api.post("/api/billing/subscription/cancel/", {});
      if (action === "resume") await api.post("/api/billing/subscription/resume/", {});
      if (action === "card") await api.delete("/api/billing/payment-method/");
      await refresh();
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось выполнить действие");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper-2/30 p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
        Автопродление
      </p>

      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
        {sub.auto_renew ? (
          <>
            Подписка продлевается автоматически
            {until && <> — следующее списание {until}</>}. За сутки до списания
            мы пришлём письмо с суммой и датой.
          </>
        ) : (
          <>
            Автоматических списаний нет.
            {until && <> Доступ к тарифу сохраняется до {until}, затем аккаунт
            перейдёт на бесплатный тариф.</>}
          </>
        )}
      </p>

      {/* Автопродление просили, но привязать средство не удалось. Без этого
          объяснения человек видит «автоматических списаний нет» ровно там, где
          он их заказывал, — и справедливо считает это ошибкой сервиса. */}
      {!sub.auto_renew && sub.auto_renew_requested && !sub.card_title && (
        <div className="mt-3 rounded-xl border border-[#e08a1e]/35 bg-[#e08a1e]/[0.08] px-4 py-3">
          <p className="flex items-start gap-2 text-[13px] font-medium text-ink">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 flex-none text-[#c2761a]"
              strokeWidth={1.9}
              aria-hidden
            />
            Автопродление не подключилось
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
            При оформлении вы просили продлевать подписку автоматически, но
            привязать платёжное средство не удалось: списывать мы умеем только с
            банковской карты. Автоматических списаний не будет — мы напомним
            письмом за сутки до окончания подписки, чтобы вы успели продлить её
            вручную. При следующей оплате с этой галочкой форма карты откроется
            сама, и продление снова станет автоматическим.
          </p>
        </div>
      )}

      {/* Привязанная карта: показываем маску, чтобы было понятно, что удаляем */}
      {sub.card_title && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-line bg-surface/70 px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] text-ink">
            <CreditCard className="h-4 w-4 text-muted" strokeWidth={1.7} />
            {sub.card_title}
          </span>
          <button
            type="button"
            onClick={() => run("card")}
            disabled={busy !== null}
            className="text-[12.5px] text-muted transition-colors hover:text-[#d4334a] disabled:opacity-50"
          >
            {busy === "card" ? "Удаляем…" : "Удалить"}
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50/50 px-3.5 py-2.5 text-[12.5px] text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="mt-4">
        {sub.auto_renew ? (
          confirming ? (
            <div className="rounded-xl border border-line bg-surface/70 p-4">
              <p className="text-[13px] leading-relaxed text-ink-soft">
                Отключить автопродление?
                {until && <> Доступ к тарифу сохранится до {until} — оплаченный
                период не пропадает.</>}
              </p>
              <div className="mt-3 flex gap-2">
                {/* Подтверждение — основное действие: отказ не должен требовать
                    усилий, это прямо запрещено ст. 16.1 ЗоЗПП. */}
                <button
                  type="button"
                  onClick={() => run("cancel")}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#d4334a] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#bb2c41] disabled:opacity-60"
                >
                  {busy === "cancel" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                  )}
                  Отключить
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy !== null}
                  className="rounded-xl px-3.5 py-2 text-[13px] text-ink-soft transition-colors hover:bg-ink/[0.06]"
                >
                  Оставить
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-xl border border-line px-4 py-2 text-[13px] text-ink-soft transition-colors hover:bg-ink/[0.06] hover:text-ink"
            >
              Отключить автопродление
            </button>
          )
        ) : (
          sub.card_title && (
            <button
              type="button"
              onClick={() => run("resume")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--brand-primary-hover)] disabled:opacity-60"
            >
              {busy === "resume" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              )}
              Включить автопродление
            </button>
          )
        )}
      </div>
    </div>
  );
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
  const prices = usePlanPrices();

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
                {/* «Продление» — только когда списание действительно будет.
                    Раньше здесь стояло «Продление» у всех подряд, и после
                    отказа от автосписаний это выглядело так, будто отказ не
                    сработал. */}
                {sub?.auto_renew
                  ? `Продление ${periodEnd}`
                  : `Действует до ${periodEnd}`}
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

      {/* Управление списаниями — сразу под тарифом, до апселла: отказ не
          должен быть спрятан за предложением купить больше. */}
      <AutoRenewControls />

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
              <span className="text-[18px] font-semibold">
                {priceOf(upsell.id, upsell.price, prices)} ₽
              </span>
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
