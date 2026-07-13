/*
 * UI-набор диалога настроек: раскладка (Section/Row/Field) и элементы ввода.
 * Чисто презентационные компоненты без API и без знания о вкладках —
 * их переиспользуют все вкладки.
 */

"use client";

import type { ReactNode } from "react";
import { ChevronDown, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

// раскладка

export function Section({
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

export function Row({
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

export function Field({
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

// элементы ввода

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
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

export function SegmentedControl<T extends string>({
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

export function SelectBox({
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

export function TextInput({
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

export function Textarea({
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

export function DangerButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-surface px-3 py-1.5 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 disabled:pointer-events-none dark:border-red-500/25 dark:text-red-300 dark:hover:bg-red-500/10"
    >
      {label}
      <Trash2 className="h-4 w-4" strokeWidth={1.7} />
    </button>
  );
}
