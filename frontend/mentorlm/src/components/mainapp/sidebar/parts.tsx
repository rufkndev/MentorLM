"use client";

/*
 * Мелкие презентационные части сайдбара: шапка, переключатель режимов, кнопка
 * нового чата, поиск и подвал. Никакого состояния — только вид и колбэки.
 */

import Link from "next/link";
import { motion } from "motion/react";
import {
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useConversations } from "@/components/mainapp/ConversationsProvider";
import {
  useSubscription,
  type UsageWindow,
} from "@/components/mainapp/SubscriptionProvider";
import { billingPlans } from "@/lib/billing-contents";
import { cn } from "@/lib/cn";
import { modes } from "@/lib/mainapp-contents";

export function SidebarHeader({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 pt-3 pb-1">
      <Link
        href="/chat"
        aria-label="На главную"
        className="rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
      >
        <Logo />
      </Link>
      <button
        type="button"
        onClick={onCollapse}
        aria-label="Свернуть сайдбар"
        title="Свернуть сайдбар"
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink"
      >
        <PanelLeftClose className="h-4 w-4" strokeWidth={1.7} />
      </button>
    </div>
  );
}

export function ModeSwitcher({ pathname }: { pathname: string | null }) {
  return (
    <div className="px-3 pt-2">
      {/* Дорожка — «ниша», вырезанная в стекле сайдбара (.inset-well), а не
          наклеенная сверху плашка. Отступ дорожки (4px) + отступ пункта (8px)
          дают те же 12px до текста, что у кнопки нового чата и строк чатов. */}
      <div className="inset-well flex flex-col gap-0.5 rounded-2xl p-1">
        {modes.map((mode) => {
          const active = pathname?.startsWith(mode.href);
          return (
            <Link
              key={mode.id}
              href={mode.href}
              className={cn(
                "relative flex h-9 items-center rounded-xl px-2 text-[13.5px] font-semibold transition-colors",
                active
                  ? "text-white"
                  : "text-ink-soft hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink"
              )}
            >
              {active && (
                <motion.span
                  layoutId="mode-pill"
                  className="absolute inset-0 rounded-xl bg-[var(--brand-primary)] shadow-[0_8px_22px_-8px_rgba(23,70,245,0.6)]"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative">{mode.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function NewChatButton() {
  return (
    <Link
      href="/chat"
      className="group flex h-10 w-full items-center gap-2 rounded-2xl bg-[var(--brand-ink)] px-3 text-[14px] font-medium text-white transition-transform duration-300 ease-out hover:translate-y-[-1px] hover:bg-[var(--brand-ink-soft)]"
    >
      <Plus className="h-[14px] w-[14px]" strokeWidth={2} />
      Новый чат
    </Link>
  );
}

export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inset-well mt-2 flex h-9 items-center gap-2 rounded-xl px-3 outline-2 outline-offset-0 outline-transparent transition-[outline-color] duration-200 focus-within:outline-[color-mix(in_srgb,var(--brand-primary)_35%,transparent)]">
      <Search
        className="h-[14px] w-[14px] shrink-0 text-muted"
        strokeWidth={1.8}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по чатам"
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
      />
    </div>
  );
}

// Одно окно квоты строкой: подпись, тонкая шкала остатка и процент.
function UsageWindowRow({ window }: { window: UsageWindow }) {
  const remaining = window.remaining_pct;
  // Цвет включается, только когда остаток реально мал — иначе шкала спокойная.
  const tone =
    remaining <= 10
      ? "#d4334a"
      : remaining <= 25
        ? "#e08a1e"
        : "var(--brand-primary)";
  return (
    <div className="flex items-center gap-2">
      <span className="w-11 shrink-0 font-mono text-[9.5px] uppercase tracking-wider text-muted">
        {window.window_label.replace("часов", "ч").replace("дней", "дн")}
      </span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--brand-ink)_10%,transparent)]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(2, remaining)}%`, background: tone }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted">
        {remaining}%
      </span>
    </div>
  );
}

// Компактный индикатор расхода текущего режима. Показываем ОБА окна квоты:
// маленький вопрос почти не двигает недельную долю, но заметно двигает
// пятичасовую — с одной общей шкалой остаток «прыгал» бы между окнами без
// объяснений. Обновляется вместе с расходом в провайдере: он приходит прямо с
// последним событием ответа, поэтому остаток виден сразу после ответа модели —
// не нужно открывать настройки или перезагружать страницу.
function UsageMeter() {
  const { usage } = useSubscription();
  const { mode } = useConversations();
  const current = usage?.modes?.[mode];
  if (!current) return null;

  return (
    <div className="mb-1 space-y-1.5 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {current.label} · осталось
      </span>
      <UsageWindowRow window={current.windows.burst} />
      <UsageWindowRow window={current.windows.week} />
    </div>
  );
}

export function SidebarFooter({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  // Апселл — только тем, кому есть куда расти: Free → Plus, Plus → Pro, на Pro
  // его нет вовсе. Пока тариф не загружен (plan === null) кнопку не рисуем,
  // чтобы платному пользователю не мигало «перейти на тариф».
  const { plan } = useSubscription();
  const upsellId = plan === "free" ? "plus" : plan === "plus" ? "pro" : null;
  const upsell = billingPlans.find((p) => p.id === upsellId);
  // Ведём на страницу тарифов, а не сразу в оплату: человек должен сначала
  // сравнить планы. Кнопка называет следующий тариф, а выбор остаётся за ним.
  const upsellHref = "/billing";

  return (
    <div className="p-3">
      <UsageMeter />
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-10 w-full items-center gap-2 rounded-2xl px-3 text-left text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink"
      >
        <Settings className="h-[14px] w-[14px]" strokeWidth={1.7} />
        Настройки
      </button>
      {upsell && (
        <Link
          href={upsellHref}
          className="mt-1 flex h-10 items-center justify-between gap-2 rounded-2xl bg-[var(--brand-primary-soft)] px-3 text-[13.5px] font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-soft)]/80"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-[14px] w-[14px]" strokeWidth={1.7} />
            Перейти на {upsell.name}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--brand-primary)]/70">
            {upsell.price}₽
          </span>
        </Link>
      )}
    </div>
  );
}
