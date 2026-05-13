"use client";

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import {
  ArrowUp,
  BookOpen,
  CheckCheck,
  Code2,
  Columns2,
  FileCode2,
  FileSearch,
  GraduationCap,
  ListChecks,
  MessageCircle,
  Microscope,
  Paperclip,
  RefreshCw,
  ShieldCheck,
  Type,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Scenario, ScenarioIconId } from "@/lib/mainapp-contents";

export type ComposerSubmit = {
  text: string;
  scenarioId: string;
  files: File[];
};

type Props = {
  onSubmit: (payload: ComposerSubmit) => void;
  scenarios: readonly Scenario[];
  defaultScenarioId: string;
  /** "hero" — большой по центру (empty state); "dock" — снизу в трэде. */
  variant?: "hero" | "dock";
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Соответствие id сценария → компоненту иконки lucide.
 * Сами иконки берём из библиотеки, чтобы они были согласованы по сетке и
 * толщине штриха. Кастомные нужны были бы только под брендовые символы.
 */
const SCENARIO_ICONS: Record<ScenarioIconId, LucideIcon> = {
  book: BookOpen,
  wrench: Wrench,
  text: Type,
  chat: MessageCircle,
  "write-code": Code2,
  refactor: RefreshCw,
  explain: FileCode2,
  review: CheckCheck,
  teach: GraduationCap,
  tests: ListChecks,
  sources: FileSearch,
  deep: Microscope,
  overview: Zap,
  compare: Columns2,
  facts: ShieldCheck,
};

export function ChatComposer({
  onSubmit,
  scenarios,
  defaultScenarioId,
  variant = "dock",
  disabled,
  placeholder = "Спросите что угодно по учёбе…",
}: Props) {
  const [text, setText] = useState("");
  const [scenarioId, setScenarioId] = useState<string>(defaultScenarioId);
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = !disabled && text.trim().length > 0;

  const handleSubmit = () => {
    if (!canSend) return;
    onSubmit({ text: text.trim(), scenarioId, files });
    setText("");
    setFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  };

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    if (list.length) setFiles((prev) => [...prev, ...list]);
    e.target.value = "";
  };

  const removeFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  return (
    <motion.div
      layout
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "mx-auto w-full",
        variant === "hero" ? "max-w-2xl" : "max-w-3xl"
      )}
    >
      <div
        className={cn(
          "glass-strong relative flex flex-col rounded-3xl p-2.5",
          "shadow-[0_18px_60px_-22px_rgba(7,27,77,0.25)]"
        )}
      >
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1.5 pb-2 pt-1">
            {files.map((file, i) => (
              <FileChip key={i} file={file} onRemove={() => removeFile(i)} />
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={variant === "hero" ? 2 : 1}
          className={cn(
            "min-h-[44px] w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-muted",
            variant === "hero" && "min-h-[80px] text-[16px]"
          )}
        />

        <div className="mt-1 flex items-center gap-1.5 px-1">
          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={handleFiles}
            className="hidden"
          />
          <ToolButton
            label="Прикрепить файл"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </ToolButton>

          <div className="ml-auto flex items-center gap-1.5">
            <SendButton onClick={handleSubmit} disabled={!canSend} />
          </div>
        </div>
      </div>

      <ScenarioRow
        scenarios={scenarios}
        active={scenarioId}
        onChange={setScenarioId}
        className="mt-2.5"
      />
    </motion.div>
  );
}

function ScenarioRow({
  scenarios,
  active,
  onChange,
  className,
}: {
  scenarios: readonly Scenario[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-1.5",
        className
      )}
    >
      {scenarios.map((s) => {
        const isActive = s.id === active;
        const Icon = SCENARIO_ICONS[s.icon];
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            title={s.description}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
              isActive
                ? "bg-[var(--brand-ink)] text-white"
                : "bg-white/55 text-ink-soft hover:bg-white/80 hover:text-ink"
            )}
          >
            <Icon className="h-[14px] w-[14px]" strokeWidth={1.7} />
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors",
        active
          ? "bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"
          : "text-ink-soft hover:bg-white/60 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function SendButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Отправить"
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full transition-all duration-300",
        disabled
          ? "bg-[var(--brand-line)] text-muted"
          : "bg-[var(--brand-primary)] text-white shadow-[0_10px_24px_-10px_rgba(23,70,245,0.6)] hover:bg-[var(--brand-primary-hover)]"
      )}
    >
      <ArrowUp className="h-[15px] w-[15px]" strokeWidth={2} />
    </button>
  );
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/60 px-2.5 py-1 text-[12px] text-ink-soft">
      <Paperclip className="h-[13px] w-[13px]" strokeWidth={1.7} />
      <span className="max-w-[160px] truncate">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Убрать файл"
        className="grid h-4 w-4 place-items-center rounded-full text-muted hover:text-ink"
      >
        ×
      </button>
    </span>
  );
}
