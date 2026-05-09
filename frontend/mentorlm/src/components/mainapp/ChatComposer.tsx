"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { chatScenarios } from "@/lib/mainapp-contents";

export type ComposerSubmit = {
  text: string;
  scenarioId: string;
  thinking: boolean;
  files: File[];
};

type Props = {
  onSubmit: (payload: ComposerSubmit) => void;
  /** "hero" — большой по центру (empty state); "dock" — снизу в трэде. */
  variant?: "hero" | "dock";
  disabled?: boolean;
  placeholder?: string;
  initialText?: string;
};

export function ChatComposer({
  onSubmit,
  variant = "dock",
  disabled,
  placeholder = "Спросите что угодно по учёбе…",
  initialText = "",
}: Props) {
  const [text, setText] = useState(initialText);
  const [thinking, setThinking] = useState(false);
  const [scenarioId, setScenarioId] = useState<string>(chatScenarios[0].id);
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // подгоняем высоту textarea под предзаполненный черновик из лендинга
  useEffect(() => {
    if (!initialText) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, [initialText]);

  const canSend = !disabled && text.trim().length > 0;

  const handleSubmit = () => {
    if (!canSend) return;
    onSubmit({ text: text.trim(), scenarioId, thinking, files });
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
            <ClipIcon />
          </ToolButton>
          <ToolButton
            label="Режим thinking"
            onClick={() => setThinking((v) => !v)}
            active={thinking}
          >
            <BrainIcon />
            <span className="hidden text-[12px] font-medium sm:inline">
              Thinking
            </span>
          </ToolButton>

          <div className="ml-auto flex items-center gap-1.5">
            <SendButton onClick={handleSubmit} disabled={!canSend} />
          </div>
        </div>
      </div>

      <ScenarioRow
        active={scenarioId}
        onChange={setScenarioId}
        className="mt-2.5"
      />
    </motion.div>
  );
}

function ScenarioRow({
  active,
  onChange,
  className,
}: {
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="px-2 font-mono text-[10px] uppercase tracking-widest text-muted">
        Сценарий
      </span>
      {chatScenarios.map((s) => {
        const isActive = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            title={s.description}
            className={cn(
              "relative rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
              isActive
                ? "bg-[var(--brand-ink)] text-white"
                : "bg-white/55 text-ink-soft hover:bg-white/80 hover:text-ink"
            )}
          >
            {s.label}
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
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors",
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
      <ArrowUp />
    </button>
  );
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/60 px-2.5 py-1 text-[12px] text-ink-soft">
      <ClipIcon />
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

/* — icons — */

function ClipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.5 7.5l-4.2 4.2a2.4 2.4 0 01-3.4-3.4l5-5a1.6 1.6 0 012.3 2.3l-4.7 4.7a.8.8 0 11-1.1-1.1l4-4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5.5 3a2 2 0 00-2 2v.4A2 2 0 002.5 7.4 2 2 0 003 11a2 2 0 002 2 2 2 0 002 2h.5V3.5A.5.5 0 007 3H5.5zM10.5 3a2 2 0 012 2v.4a2 2 0 011 2 2 2 0 01-.5 3.6 2 2 0 01-2 2 2 2 0 01-2 2H8.5V3.5a.5.5 0 01.5-.5h1.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 13V3m0 0L4 7m4-4l4 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
