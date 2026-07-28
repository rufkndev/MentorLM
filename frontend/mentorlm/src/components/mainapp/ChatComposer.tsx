/**
 * Композер сообщения (поле ввода внизу чата / по центру на пустом экране).
 * Управляет текстом, вложениями и рядом сценариев; сам выбранный сценарий
 * хранится снаружи (в ChatScreen). Отправку отдаёт наверх через onSubmit.
 */

"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { motion } from "motion/react";
import {
  ArrowUp,
  BadgeCheck,
  BookOpenText,
  ClipboardList,
  Code2,
  FlaskConical,
  GraduationCap,
  Library,
  Lightbulb,
  MessagesSquare,
  Paperclip,
  PenLine,
  Scale,
  SearchCheck,
  Square,
  Telescope,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { takeDraft } from "@/lib/draft";
import type { Scenario, ScenarioIconId } from "@/lib/mainapp-contents";

export type ComposerSubmit = {
  text: string;
  scenarioId: string;
  files: File[];
};

type Props = {
  onSubmit: (payload: ComposerSubmit) => void;
  scenarios: readonly Scenario[];
  /** Выбранный сценарий — управляется снаружи (ChatScreen), чтобы он сохранялся
   *  на весь диалог, а не сбрасывался при смене hero↔dock композера. */
  scenarioId: string;
  onScenarioChange: (id: string) => void;
  /** "hero" — большой по центру (empty state); "dock" — снизу в трэде. */
  variant?: "hero" | "dock";
  /** Отправка недоступна (идёт ответ). Поле ввода при этом остаётся активным:
   *  следующий вопрос можно набирать, не дожидаясь конца генерации. */
  disabled?: boolean;
  /** Идёт генерация ответа — кнопка отправки превращается в «Стоп». */
  streaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  /** Подставить черновик вопроса с лендинга (только на пустом hero-экране). */
  seedDraft?: boolean;
};

// Соответствие id сценария → иконке lucide (для чипов сценариев).
// Набор подобран по действию, а не по предмету: «объяснить» — лампочка, а не
// файл кода; «сравнить» — весы, а не две колонки; «проверить факты» — знак
// подтверждения, а не щит. Так чип читается с одного взгляда, без подписи.
const SCENARIO_ICONS: Record<ScenarioIconId, LucideIcon> = {
  study: BookOpenText,
  assignment: ClipboardList,
  writing: PenLine,
  talk: MessagesSquare,
  "write-code": Code2,
  refactor: Wand2,
  explain: Lightbulb,
  review: SearchCheck,
  teach: GraduationCap,
  tests: FlaskConical,
  sources: Library,
  deep: Telescope,
  overview: Zap,
  compare: Scale,
  facts: BadgeCheck,
};

// Ограничения вложений — совпадают с бэком (apps/conversations/attachments.py).
const MAX_FILES = 5;
const MAX_FILE_MB = 10;
// Форматы, из которых бэк умеет извлекать текст (pdf/docx/текст/код).
const ACCEPT_ATTACHMENTS =
  ".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.xml,.html,.py,.js,.ts,.tsx,.jsx,.java,.c,.h,.cpp,.cs,.go,.rs,.rb,.php,.swift,.kt,.sql,.sh,.css,.scss";

// Композер: текст + вложения + ряд сценариев; hero (центр) или dock (низ).
export function ChatComposer({
  onSubmit,
  scenarios,
  scenarioId,
  onScenarioChange,
  variant = "dock",
  disabled,
  streaming = false,
  onStop,
  placeholder = "Спросите что угодно по учёбе…",
  seedDraft = false,
}: Props) {
  // При seedDraft одноразово забираем черновик с лендинга как стартовый текст.
  const [text, setText] = useState(() => (seedDraft ? takeDraft() : ""));
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Отправить можно, если есть текст ИЛИ хотя бы одно вложение.
  const canSend = !disabled && (text.trim().length > 0 || files.length > 0);

  // Если подставлен черновик — растим поле под его высоту и ставим курсор.
  useEffect(() => {
    if (!seedDraft || !text) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
    ta.focus();
    ta.setSelectionRange(text.length, text.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Отправка сообщения наверх + сброс поля и вложений.
  const handleSubmit = () => {
    if (!canSend) return;
    onSubmit({ text: text.trim(), scenarioId, files });
    setText("");
    setFiles([]);
    setFileError(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  // Enter — отправка, Shift+Enter — перенос строки. Во время ответа модели
  // Enter ничего не отправляет, но набранный текст сохраняется в поле.
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Ввод текста + авто-рост высоты поля.
  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  };

  // Добавление файлов с валидацией размера и количества (как на бэке).
  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!picked.length) return;

    const errors: string[] = [];
    const fitting = picked.filter((f) => {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        errors.push(`«${f.name}» больше ${MAX_FILE_MB} МБ`);
        return false;
      }
      return true;
    });

    let merged = [...files, ...fitting];
    if (merged.length > MAX_FILES) {
      merged = merged.slice(0, MAX_FILES);
      errors.push(`не больше ${MAX_FILES} файлов за раз`);
    }
    setFiles(merged);
    setFileError(errors.length ? errors.join("; ") : null);
  };

  // Удаление одного вложения по индексу.
  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setFileError(null);
  };

  return (
    <motion.div
      layout
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "mx-auto w-full",
        variant === "hero" ? "max-w-3xl" : "max-w-5xl"
      )}
    >
      <div
        className={cn(
          "glass-strong relative flex flex-col rounded-3xl p-2.5",
          // Подсветка фокуса — через outline, а не ring: у .glass-strong свой
          // box-shadow (кромка стекла), и ring его бы просто не пересилил.
          "outline-2 outline-offset-0 outline-transparent transition-[outline-color] duration-300",
          "focus-within:outline-[color-mix(in_srgb,var(--brand-primary)_28%,transparent)]"
        )}
      >
        {/* Чипсы прикреплённых файлов (если есть) */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-2.5 pb-2 pt-1">
            {files.map((file, i) => (
              <FileChip key={i} file={file} onRemove={() => removeFile(i)} />
            ))}
          </div>
        )}

        {/* Ошибка валидации вложений */}
        {fileError && (
          <p className="px-2.5 pb-1.5 text-[12px] text-red-600 dark:text-red-400">
            {fileError}
          </p>
        )}

        {/* Поле ввода сообщения */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={variant === "hero" ? 2 : 1}
          className={cn(
            "thin-scroll min-h-[44px] w-full resize-none bg-transparent px-2.5 py-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-muted",
            variant === "hero" && "min-h-[80px] text-[16px]"
          )}
        />

        {/* Нижний ряд: прикрепить файл (слева) и отправить (справа) */}
        <div className="mt-1 flex items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT_ATTACHMENTS}
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
            {/* Во время ответа та же кнопка останавливает генерацию (как в Claude) */}
            {streaming ? (
              <StopButton onClick={() => onStop?.()} />
            ) : (
              <SendButton onClick={handleSubmit} disabled={!canSend} />
            )}
          </div>
        </div>
      </div>

      {/* Ряд чипов-сценариев под композером */}
      <ScenarioRow
        scenarios={scenarios}
        active={scenarioId}
        onChange={onScenarioChange}
        className="mt-2.5"
      />
    </motion.div>
  );
}

// Ряд чипов-сценариев (пресетов задачи внутри режима).
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
            aria-pressed={isActive}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
              isActive
                ? "bg-[var(--brand-ink)] text-white"
                // Невыбранные чипы — стекло: они лежат прямо на фоне страницы,
                // и материал делает ряд лёгким, не добавляя ни одной линии.
                : "glass-chip text-ink-soft hover:text-ink"
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

// Круглая кнопка-инструмент композера (напр. «прикрепить файл»).
function ToolButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink"
    >
      {children}
    </button>
  );
}

// Кнопка отправки сообщения.
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

// Кнопка остановки генерации — занимает место кнопки отправки, пока идёт ответ.
function StopButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Остановить ответ"
      title="Остановить ответ"
      className="grid h-9 w-9 place-items-center rounded-full bg-[var(--brand-ink)] text-white shadow-[0_10px_24px_-10px_rgba(7,27,77,0.6)] transition-all duration-300 hover:bg-[var(--brand-ink-soft)]"
    >
      <Square className="h-[13px] w-[13px] fill-current" strokeWidth={0} />
    </button>
  );
}

// Чип прикреплённого файла с крестиком удаления.
function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  // Внутри композера стекла уже достаточно: чип лежит НА стеклянной панели,
  // второй слой блюра там не читается — оставляем простую заливку.
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] px-2.5 py-1 text-[12px] text-ink-soft">
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
