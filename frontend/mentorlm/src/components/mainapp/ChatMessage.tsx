/**
 * Один пузырёк сообщения в треде чата.
 * Сообщение пользователя — справа простым текстом; ответ ИИ — слева с аватаром
 * и Markdown-разметкой; во время генерации показывает индикатор «думаю».
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { AlertTriangle, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Markdown } from "@/components/mainapp/Markdown";

// Метаданные прикреплённого файла (для чипсов в пузырьке).
export type MessageAttachment = {
  id?: number;
  filename: string;
  size: number;
  content_type?: string;
};

// Модель одного сообщения в чате.
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: boolean; // true — идёт генерация ответа
  attachments?: MessageAttachment[]; // прикреплённые файлы (у сообщений пользователя)
  degraded?: boolean; // ответ на упрощённой модели (квота исчерпана)
  canUpgrade?: boolean; // показывать ли апселл в плашке деградации
};

// Пузырёк сообщения (пользователь или ассистент).
export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex w-full gap-3",
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
            <Markdown content={message.content} />
          </>
        )}
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
        Лимит режима исчерпан — отвечаем на упрощённой модели.{" "}
        {canUpgrade && (
          <Link href="/billing" className="font-medium underline underline-offset-2">
            Перейти на тариф выше
          </Link>
        )}
      </p>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Закрыть"
        className="shrink-0 rounded-md p-0.5 text-amber-700/70 transition-colors hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

// Человекочитаемый размер файла (Б / КБ / МБ).
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
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
        думаю
      </span>
    </span>
  );
}
