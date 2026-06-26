"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  Brain,
  Check,
  ChevronDown,
  Cog,
  Cpu,
  CreditCard,
  Database,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/api";
import { useSettings } from "@/components/mainapp/SettingsProvider";

type TabId = "general" | "model" | "memory" | "subscription" | "data";

type Props = {
  open: boolean;
  onClose: () => void;
};

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "Общие", icon: Cog },
  { id: "model", label: "Модель ИИ", icon: Cpu },
  { id: "memory", label: "Память", icon: Brain },
  { id: "subscription", label: "Подписка", icon: CreditCard },
  { id: "data", label: "Данные", icon: Database },
];

export function SettingsDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState<TabId>("general");

  /* ESC закрывает */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* блокируем скролл body */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4 backdrop-blur-sm"
        >
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Настройки"
            className="relative flex h-[620px] w-[860px] max-h-[92vh] max-w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_80px_-24px_rgba(7,27,77,0.4)]"
          >
            <aside className="flex w-[220px] shrink-0 flex-col border-r border-line bg-paper-2/40 p-3">
              <h2 className="px-2 pb-3 pt-1 text-[15px] font-semibold text-ink">
                Настройки
              </h2>
              <nav className="flex flex-col gap-0.5">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] transition-colors",
                        active
                          ? "bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"
                          : "text-ink-soft hover:bg-ink/[0.06] hover:text-ink"
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.7} />
                      {t.label}
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="relative flex-1 overflow-y-auto">
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
              >
                <X className="h-4 w-4" strokeWidth={1.7} />
              </button>

              <div className="px-7 py-6 pr-12">
                {tab === "general" && <GeneralTab />}
                {tab === "model" && <ModelTab />}
                {tab === "memory" && <MemoryTab />}
                {tab === "subscription" && <SubscriptionTab />}
                {tab === "data" && <DataTab />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════ tabs ═══════════════════════════ */

function GeneralTab() {
  const { settings, update } = useSettings();

  return (
    <Section title="Общие">
      <Row label="Тема" hint="Светлая, тёмная или как в системе">
        <SegmentedControl
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { value: "system", label: "Системная", icon: Monitor },
            { value: "light", label: "Светлая", icon: Sun },
            { value: "dark", label: "Тёмная", icon: Moon },
          ]}
        />
      </Row>
      <Row label="Размер шрифта в чате">
        <SegmentedControl
          value={settings.font_size}
          onChange={(font_size) => update({ font_size })}
          options={[
            { value: "sm", label: "Мелкий" },
            { value: "md", label: "Средний" },
            { value: "lg", label: "Крупный" },
          ]}
        />
      </Row>
      <Row
        label="Подсказки промптов"
        hint="Показывать примеры запросов на пустом экране"
      >
        <Toggle
          checked={settings.show_suggestions}
          onChange={(show_suggestions) => update({ show_suggestions })}
        />
      </Row>
    </Section>
  );
}

function ModelTab() {
  const { settings, update } = useSettings();

  return (
    <Section
      title="Модель ИИ"
      description="Параметры, с которыми модель отвечает по умолчанию. Каждый сценарий может переопределять их."
    >
      <Row label="Модель по умолчанию" hint="Используется во всех режимах">
        <SelectBox
          value={settings.default_model}
          onChange={(default_model) => update({ default_model })}
          options={[
            { value: "mentor-pro", label: "Mentor Pro — умная, медленнее" },
            { value: "mentor-lite", label: "Mentor Lite — быстрая" },
            { value: "mentor-vision", label: "Mentor Vision — с картинками" },
          ]}
        />
      </Row>
      <Row label="Длина ответов">
        <SegmentedControl
          value={settings.response_length}
          onChange={(response_length) => update({ response_length })}
          options={[
            { value: "short", label: "Короткие" },
            { value: "balanced", label: "Средние" },
            { value: "detailed", label: "Подробные" },
          ]}
        />
      </Row>
      <Row
        label="Креативность"
        hint="0 — точные предсказуемые ответы; 1 — свободные и творческие"
      >
        <Slider
          value={settings.temperature}
          min={0}
          max={1}
          step={0.1}
          onChange={(temperature) => update({ temperature })}
          format={(v) => v.toFixed(1)}
        />
      </Row>
      <Row label="Длина контекста" hint="Сколько прошлых сообщений учитывать">
        <SelectBox
          value={settings.context_size}
          onChange={(context_size) => update({ context_size })}
          options={[
            { value: "5", label: "5 сообщений" },
            { value: "10", label: "10 сообщений" },
            { value: "20", label: "20 сообщений" },
            { value: "50", label: "50 сообщений" },
            { value: "all", label: "Весь чат" },
          ]}
        />
      </Row>
      <Row
        label="Потоковая выдача"
        hint="Печатать ответ постепенно, как только модель его генерирует"
      >
        <Toggle
          checked={settings.streaming}
          onChange={(streaming) => update({ streaming })}
        />
      </Row>
      <Row
        label="Поиск в интернете"
        hint="Разрешить модели искать актуальную информацию"
      >
        <Toggle
          checked={settings.web_search}
          onChange={(web_search) => update({ web_search })}
        />
      </Row>
    </Section>
  );
}

function MemoryTab() {
  const { settings, update } = useSettings();

  return (
    <Section
      title="Память и инструкции"
      description="Эти данные модель будет использовать в каждом разговоре. Можно оставить пустым."
    >
      <Row label="Как к вам обращаться" hint="Имя или ник для ответов модели">
        <TextInput
          value={settings.nickname}
          onChange={(nickname) => update({ nickname })}
          placeholder="Например: Артём"
        />
      </Row>
      <Row label="Чем вы занимаетесь" hint="Помогает модели подбирать примеры">
        <TextInput
          value={settings.occupation}
          onChange={(occupation) => update({ occupation })}
          placeholder="Например: студент-программист"
        />
      </Row>
      <Field
        label="Что важно знать о вас"
        hint="Например: студент 3 курса CS; интересуют ML и алгоритмы; учу английский"
      >
        <Textarea
          value={settings.custom_about}
          onChange={(custom_about) => update({ custom_about })}
          placeholder="Расскажите о себе, своей учёбе и интересах…"
          rows={4}
        />
      </Field>
      <Field
        label="Как вы хотите получать ответы"
        hint="Например: короче, на русском, с примерами кода; не извиняйся, переходи сразу к делу"
      >
        <Textarea
          value={settings.custom_style}
          onChange={(custom_style) => update({ custom_style })}
          placeholder="Опишите предпочитаемый стиль ответов…"
          rows={4}
        />
      </Field>
      <Row
        label="Автоматическая память"
        hint="Модель будет сама запоминать факты о вас между чатами"
      >
        <Toggle
          checked={settings.auto_memory}
          onChange={(auto_memory) => update({ auto_memory })}
        />
      </Row>
      <div className="rounded-xl border border-line bg-paper-2/30 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[13.5px] font-medium text-ink">Сохранённые факты</p>
          <button
            type="button"
            className="text-[12.5px] text-muted hover:text-ink"
            disabled
          >
            Очистить все
          </button>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          Пока ничего не сохранено. Модель будет добавлять сюда факты, которые
          посчитает важными.
        </p>
      </div>
    </Section>
  );
}

type SubscriptionInfo = {
  plan: string;
  plan_label: string;
  daily_messages: number | null;
};
type UsageInfo = { request_count: number; daily_limit: number | null };

function SubscriptionTab() {
  const api = useApi();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  useEffect(() => {
    // read-only заглушки ЛК: тариф и сегодняшнее использование с бэка.
    api.get<SubscriptionInfo>("/api/me/subscription/").then(setSub).catch(() => {});
    api.get<UsageInfo>("/api/me/usage/").then(setUsage).catch(() => {});
  }, [api]);

  const planLabel = sub?.plan_label ?? "Free";
  const limit = sub?.daily_messages ?? null; // null = безлимит
  const current = usage?.request_count ?? 0;
  const pct = limit ? Math.min(100, Math.round((current / limit) * 100)) : 0;

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
              {limit === null
                ? "Безлимит сообщений"
                : `Базовые модели · ${limit} сообщений в день`}
            </p>
          </div>
          <span className="rounded-full bg-surface px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted ring-1 ring-line">
            {planLabel}
          </span>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[12.5px] text-muted">
            <span>Использовано сегодня</span>
            <span>
              {current} / {limit === null ? "∞" : limit}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-[var(--brand-primary)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
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
            "Без лимитов на сообщения",
            "Доступ к Mentor Pro и Vision",
            "Длинный контекст до 200K токенов",
            "Поиск в интернете и работа с PDF",
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
            <span className="text-[18px] font-semibold">490 ₽</span>
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

      <div className="flex items-center justify-between border-t border-line pt-4 text-[13px]">
        <span className="text-muted">История платежей</span>
        <button
          type="button"
          className="text-ink-soft hover:text-ink"
          disabled
        >
          Скоро
        </button>
      </div>
    </Section>
  );
}

function DataTab() {
  const [improveModel, setImproveModel] = useState(false);
  const [saveHistory, setSaveHistory] = useState(true);

  return (
    <Section title="Данные и приватность">
      <Row
        label="Использовать чаты для улучшения модели"
        hint="Анонимизированные диалоги помогают нам делать модель умнее"
      >
        <Toggle checked={improveModel} onChange={setImproveModel} />
      </Row>
      <Row
        label="Сохранять историю чатов"
        hint="Если выключить — новые чаты не будут сохраняться"
      >
        <Toggle checked={saveHistory} onChange={setSaveHistory} />
      </Row>
      <Row label="Экспорт чатов" hint="Скачать архив со всеми чатами в JSON">
        <button
          type="button"
          disabled
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-soft opacity-60"
        >
          Скоро
        </button>
      </Row>
      <Row label="Архив чатов" hint="Скрытые из сайдбара, но не удалённые">
        <button
          type="button"
          disabled
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-soft opacity-60"
        >
          Открыть
        </button>
      </Row>

      <div className="mt-4 rounded-xl border border-red-200 bg-red-50/40 p-4 dark:border-red-500/25 dark:bg-red-500/10">
        <p className="text-[13.5px] font-medium text-red-700 dark:text-red-300">
          Опасная зона
        </p>
        <p className="mt-1 text-[12.5px] text-red-700/70 dark:text-red-300/60">
          Эти действия необратимы.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <DangerButton
            label="Удалить все чаты"
            onClick={() => {
              /* TODO: backend */
            }}
          />
          <DangerButton
            label="Удалить аккаунт"
            onClick={() => {
              /* TODO: backend */
            }}
          />
        </div>
      </div>
    </Section>
  );
}

/* ═══════════════════════════ pieces ═══════════════════════════ */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 text-[13px] text-muted">{description}</p>
      )}
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0">
      <div>
        <p className="text-[14px] font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  /*
   * Размеры: track 24×44, padding 2px, thumb 20×20.
   * Ход thumb = 44 - 4 (padding × 2) - 20 (thumb) = 20px.
   * transform задаём inline-стилем: tailwind v4 translate-* через
   * --tw-translate-x ломается без других transform-утилит на узле, поэтому
   * страхуемся явным `translateX(...)`.
   */
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 outline-none transition-colors duration-200",
        "focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-surface)]",
        checked
          ? "bg-[var(--brand-primary)]"
          : "bg-[var(--brand-line)] hover:bg-[color-mix(in_oklab,var(--brand-line),var(--brand-muted)_18%)]"
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(9,15,31,0.22),0_0_0_0.5px_rgba(9,15,31,0.06)]"
        style={{
          transform: checked ? "translateX(20px)" : "translateX(0px)",
          transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
}) {
  return (
    <div className="flex rounded-lg bg-paper-2/60 p-0.5">
      {options.map((o) => {
        const Icon = o.icon;
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] transition-colors",
              active
                ? "bg-surface text-ink shadow-[0_1px_2px_rgba(9,15,31,0.08)] dark:shadow-none dark:ring-1 dark:ring-white/10"
                : "text-muted hover:text-ink"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[200px] appearance-none rounded-lg border border-line bg-surface px-3 py-1.5 pr-8 text-[13px] text-ink outline-none transition-colors hover:bg-paper-2/40 focus:border-[var(--brand-primary)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
        strokeWidth={1.7}
      />
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  /*
   * Заливка трека слева от thumb идёт через background-gradient на самом input.
   * Кросс-браузерный способ — нет «лишних» псевдоэлементов и не зависит
   * от ::-webkit-slider-runnable-track (который не работает в Firefox).
   */
  return (
    <div className="flex min-w-[220px] items-center gap-3">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-slider flex-1"
        style={{
          background: `linear-gradient(to right, var(--brand-primary) 0%, var(--brand-primary) ${pct}%, var(--brand-line) ${pct}%, var(--brand-line) 100%)`,
        }}
      />
      <span className="w-9 text-right font-mono text-[12px] tabular-nums text-muted">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-w-[220px] rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink outline-none transition-colors placeholder:text-muted hover:bg-paper-2/40 focus:border-[var(--brand-primary)]"
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-[var(--brand-primary)]"
    />
  );
}

function DangerButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-surface px-3 py-1.5 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-500/25 dark:text-red-300 dark:hover:bg-red-500/10"
    >
      {label}
      <Trash2 className="h-4 w-4" strokeWidth={1.7} />
    </button>
  );
}
