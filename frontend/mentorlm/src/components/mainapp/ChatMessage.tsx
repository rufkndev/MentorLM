/**
 * Один пузырёк сообщения в треде чата.
 * Сообщение пользователя — справа простым текстом; ответ ИИ — слева с аватаром
 * и Markdown-разметкой; во время генерации показывает индикатор «думаю».
 */

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  AlertTriangle,
  Brain,
  Check,
  Copy,
  Download,
  FileText,
  FileType,
  Library,
  Loader2,
  Paperclip,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react";
import { messageCopy } from "@/content/app";
import { useApi } from "@/hooks/useApi";
import { saveBlob } from "@/lib/download";
import { safeExternalUrl } from "@/lib/safe-url";
import { cn } from "@/lib/cn";
import { Markdown } from "@/components/mainapp/Markdown";

// Метаданные прикреплённого файла (для чипсов в пузырьке).
export type MessageAttachment = {
  id?: number;
  filename: string;
  size: number;
  content_type?: string;
};

// Источник веб-поиска, на который опирался ответ.
export type MessageSource = { url: string; title: string };

// Модель одного сообщения в чате.
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: boolean; // true — идёт генерация ответа
  attachments?: MessageAttachment[]; // прикреплённые файлы (у сообщений пользователя)
  degraded?: boolean; // ответ на упрощённой модели (квота исчерпана)
  canUpgrade?: boolean; // показывать ли апселл в плашке деградации
  stopped?: boolean; // генерацию остановил пользователь — ответ неполный
  reasoned?: boolean; // ответ считался с обдумыванием (переключатель в композере)
  /** Источники веб-поиска («Исследовать»): показываются панелью под ответом. */
  sources?: MessageSource[];
  /** Сбой ответа. Показывается ПОД уже написанным текстом — написанное не
   *  затираем: часть ответа обычно полезна и сохранена на бэке. */
  error?: string;
  canRetry?: boolean; // предлагать ли «Повторить»
  /** Сообщение системы, а не модели (код лимита из meta.code). Хранится в БД,
   *  поэтому плашка остаётся в чате после ухода на /billing и возврата. */
  notice?: string;
};

// Пузырёк сообщения (пользователь или ассистент).
export function ChatMessage({
  message,
  conversationId,
  onRetry,
}: {
  message: Message;
  /** id диалога; без него выгрузку показать не можем — адрес неполный. */
  conversationId?: string | null;
  onRetry?: () => void;
}) {
  const isUser = message.role === "user";

  // Уведомление системы (упор в лимит тарифа) — не пузырёк диалога, а плашка
  // во всю ширину: она про тариф, а не про содержание разговора.
  if (message.notice) {
    return (
      <LimitNotice text={message.content} canUpgrade={message.canUpgrade} />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group/msg flex w-full gap-3",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* Аватар ассистента слева (у сообщений пользователя его нет) */}
      {!isUser && <AssistantAvatar />}

      {/* Тело сообщения: текст пользователя / индикатор / Markdown ответа */}
      <div
        className={cn(
          "chat-text rounded-3xl px-4 py-3",
          isUser
            ? "max-w-[78%] whitespace-pre-wrap bg-[var(--brand-primary)] text-white shadow-[0_12px_28px_-14px_rgba(23,70,245,0.55)]"
            : "min-w-0 max-w-[92%] flex-1 text-ink"
        )}
      >
        {message.thinking ? (
          <ThinkingDots />
        ) : isUser ? (
          <>
            {/* Чипсы прикреплённых файлов над текстом сообщения */}
            {message.attachments && message.attachments.length > 0 && (
              <AttachmentChips items={message.attachments} />
            )}
            {message.content}
          </>
        ) : (
          <>
            {message.degraded && (
              <DegradedNotice canUpgrade={message.canUpgrade} />
            )}
            {message.reasoned && <ReasonedBadge />}
            <Markdown content={message.content} />
            {message.sources && message.sources.length > 0 && (
              <SourcesPanel
                sources={message.sources}
                messageId={message.id}
                conversationId={conversationId}
              />
            )}
            {message.stopped && (
              <p className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-muted">
                {messageCopy.stopped}
              </p>
            )}
            {message.error && (
              <ErrorNotice
                text={message.error}
                onRetry={message.canRetry ? onRetry : undefined}
              />
            )}
            {/* Действия над готовым ответом — появляются при наведении */}
            {message.content && (
              <MessageActions
                text={message.content}
                messageId={message.id}
                conversationId={conversationId}
              />
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

// Панель действий под ответом ИИ. Пока одно действие — копирование: чаще всего
// ответ нужен именно целиком, а выделять его мышью в длинном тексте неудобно.
function MessageActions({
  text,
  messageId,
  conversationId,
}: {
  text: string;
  messageId: string;
  conversationId?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Буфер обмена недоступен (нет разрешения/http) — молча ничего не делаем.
    }
  };

  return (
    <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover/msg:opacity-100">
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? messageCopy.copied : messageCopy.copy}
        title={copied ? messageCopy.copied : messageCopy.copy}
        className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_7%,transparent)] hover:text-ink"
      >
        {copied ? (
          <Check className="h-[15px] w-[15px]" strokeWidth={2} />
        ) : (
          <Copy className="h-[15px] w-[15px]" strokeWidth={1.7} />
        )}
      </button>

      {/* Выгружать можно только сохранённый на бэке ответ: у живого id ещё
          локальный (uuid), и адрес выгрузки собрать не из чего. */}
      {conversationId && /^\d+$/.test(messageId) && (
        <ExportMenu conversationId={conversationId} messageId={messageId} />
      )}
    </div>
  );
}

// Панель источников под ответом режима «Исследовать».
//
// ⚠️ Заголовки и адреса пишет не наш сервер — это страницы, найденные в
// интернете. Поэтому они рендерятся как обычный текст и href (не через
// Markdown), а адрес проходит safeExternalUrl: только https, никаких
// javascript: и data:.
function SourcesPanel({
  sources,
  messageId,
  conversationId,
}: {
  sources: MessageSource[];
  messageId: string;
  conversationId?: string | null;
}) {
  const api = useApi();
  const [busy, setBusy] = useState(false);

  const downloadList = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await api.download(
        `/api/conversations/${conversationId}/messages/${messageId}/export/sources/`,
        `${messageCopy.sourcesFallbackName}.docx`,
      );
      saveBlob(blob, filename);
    } catch {
      // Молча: список источников уже виден, а причина сбоя пользователю
      // ничего не даёт.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-line bg-paper-2/40 px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Library className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.8} />
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
          {messageCopy.sourcesTitle} · {sources.length}
        </p>
        {conversationId && /^\d+$/.test(messageId) && (
          <button
            type="button"
            onClick={downloadList}
            disabled={busy}
            className="ml-auto text-[12px] text-[var(--brand-primary)] underline underline-offset-2 transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {busy ? messageCopy.sourcesBusy : messageCopy.sourcesDownload}
          </button>
        )}
      </div>

      <ol className="flex flex-col gap-1.5">
        {sources.map((source, i) => {
          const href = safeExternalUrl(source.url);
          let domain = "";
          try {
            domain = new URL(source.url).hostname.replace(/^www\./, "");
          } catch {
            domain = "";
          }
          return (
            <li key={source.url} className="flex items-start gap-2">
              <span className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-[5px] bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] font-mono text-[10px] text-muted">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-snug">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink underline decoration-line underline-offset-2 hover:decoration-[var(--brand-primary)]"
                  >
                    {source.title || domain || source.url}
                  </a>
                ) : (
                  <span className="text-ink">{source.title || source.url}</span>
                )}
                {domain && (
                  <span className="ml-1.5 text-[12px] text-muted">{domain}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Выгрузка ответа файлом: .docx с оформлением по ГОСТ или .md как есть.
// Меню, а не две кнопки: два одинаковых значка рядом ничего не говорят.
function ExportMenu({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Закрытие по клику вне и по Escape — тем же приёмом, что меню аккаунта.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = async (fmt: "docx" | "md") => {
    setBusy(fmt);
    setFailed(false);
    try {
      const { blob, filename } = await api.download(
        `/api/conversations/${conversationId}/messages/${messageId}/export/${fmt}/`,
        `${messageCopy.exportFallbackName}.${fmt}`,
      );
      saveBlob(blob, filename);
      setOpen(false);
    } catch {
      // Текст ошибки бэка тут не показываем: строка узкая, а причина почти
      // всегда одна — документ не собрался. Подробности уже в логах сервера.
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={messageCopy.exportTitle}
        title={failed ? messageCopy.exportFailed : messageCopy.exportTitle}
        className={cn(
          "grid h-7 w-7 place-items-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_7%,transparent)] hover:text-ink",
          failed ? "text-red-600 dark:text-red-400" : "text-muted",
        )}
      >
        {busy ? (
          <Loader2 className="h-[15px] w-[15px] animate-spin" strokeWidth={1.9} />
        ) : (
          <Download className="h-[15px] w-[15px]" strokeWidth={1.7} />
        )}
      </button>

      {open && (
        <div className="glass-strong absolute bottom-9 left-0 z-50 w-[210px] rounded-xl p-1">
          <button
            type="button"
            onClick={() => run("docx")}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_7%,transparent)]"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.7} />
            {messageCopy.exportDocx}
          </button>
          <button
            type="button"
            onClick={() => run("md")}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_7%,transparent)]"
          >
            <FileType className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.7} />
            {messageCopy.exportMd}
          </button>
        </div>
      )}
    </div>
  );
}

// Пометка «ответ обдуман»: тихая строка над текстом. Нужна, чтобы при
// возврате в диалог было видно, какие ответы стоили дороже и почему они
// подробнее остальных.
function ReasonedBadge() {
  return (
    <p className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted">
      <Brain className="h-3 w-3" strokeWidth={1.8} />
      {messageCopy.reasoned}
    </p>
  );
}

// Сбой ответа: под уже написанным текстом, с кнопкой «Повторить». Текст ответа
// не трогаем — бэк сохранил ту же часть, и она обычно полезна сама по себе.
function ErrorNotice({
  text,
  onRetry,
}: {
  text: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper-2/40 px-3 py-2 text-[12.5px] text-ink-soft">
      <AlertTriangle
        className="h-3.5 w-3.5 shrink-0 text-muted"
        strokeWidth={1.8}
      />
      <span className="min-w-0 flex-1">{text}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-[var(--brand-ink-soft)]"
        >
          <RotateCw className="h-3 w-3" strokeWidth={2} />
          {messageCopy.retry}
        </button>
      )}
    </div>
  );
}

// Плашка «лимит тарифа исчерпан» — сообщение системы, сохранённое в диалоге.
// Не закрывается: она отражает состояние тарифа и должна оставаться в чате,
// пока пользователь не перейдёт на тариф выше.
function LimitNotice({
  text,
  canUpgrade,
}: {
  text: string;
  canUpgrade?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-2xl rounded-2xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary-soft)]/40 px-4 py-3"
    >
      <div className="flex items-start gap-2.5">
        <Sparkles
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-primary)]"
          strokeWidth={1.7}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-relaxed text-ink">{text}</p>
          {canUpgrade && (
            <Link
              href="/billing"
              className="mt-2 inline-flex rounded-xl bg-[var(--brand-primary)] px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[var(--brand-primary-hover)]"
            >
              {messageCopy.seePlans}
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Плашка «квота исчерпана, отвечаем на упрощённой модели». Закрывается крестиком;
// апселл показываем только тем, кому есть куда расти (не на топ-тарифе).
function DegradedNotice({ canUpgrade }: { canUpgrade?: boolean }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-300/50 bg-amber-50/70 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
      <p className="min-w-0 flex-1">
        {messageCopy.degraded}{" "}
        {canUpgrade && (
          <Link href="/billing" className="font-medium underline underline-offset-2">
            {messageCopy.degradedUpgrade}
          </Link>
        )}
      </p>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label={messageCopy.close}
        className="shrink-0 rounded-md p-0.5 text-amber-700/70 transition-colors hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

// Человекочитаемый размер файла (Б / КБ / МБ).
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${messageCopy.bytes}`;
  if (bytes < 1024 * 1024)
    return `${Math.round(bytes / 1024)} ${messageCopy.kilobytes}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${messageCopy.megabytes}`;
}

// Ряд чипсов с прикреплёнными файлами (в пузырьке пользователя).
function AttachmentChips({ items }: { items: MessageAttachment[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {items.map((f, i) => (
        <span
          key={f.id ?? i}
          className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[12px] text-white/90"
        >
          <Paperclip className="h-3 w-3 shrink-0" strokeWidth={1.8} />
          <span className="max-w-[160px] truncate">{f.filename}</span>
          <span className="shrink-0 text-white/60">{formatBytes(f.size)}</span>
        </span>
      ))}
    </div>
  );
}

// Градиентный аватар ассистента (мини-логотип).
function AssistantAvatar() {
  return (
    <span
      aria-hidden
      className="relative mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-xl"
      style={{
        background:
          "conic-gradient(from 200deg at 50% 50%, #1746F5 0deg, #56D9FF 120deg, #7B61FF 240deg, #1746F5 360deg)",
        boxShadow:
          "inset 0 0 0 1px rgba(255,255,255,0.5), 0 6px 16px -8px rgba(23,70,245,0.55)",
      }}
    >
      <span className="absolute inset-[3px] rounded-[9px] bg-[var(--brand-paper)]" />
      <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]" />
    </span>
  );
}

// Анимированный индикатор «думаю» на время генерации ответа.
function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="thinking-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
      <span className="ml-1 font-mono text-[11px] uppercase tracking-widest">
        {messageCopy.thinking}
      </span>
    </span>
  );
}
