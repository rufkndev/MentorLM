/**
 * Интерактивный тизер чата в CTA-секции лендинга.
 * Пользователь набирает вопрос; при отправке черновик кладётся в sessionStorage
 * и происходит переход в чат (если вошёл) или на регистрацию.
 */

"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useState, type ChangeEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { saveDraft } from "@/lib/draft";

// Мини-композер для лендинга.
export function LandingChatTeaser() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSend = text.trim().length > 0 && !submitting;

  // Сохраняет черновик и уводит в чат или на регистрацию.
  const handleSend = () => {
    if (!canSend) return;
    setSubmitting(true);
    saveDraft(text.trim());
    const target = isLoaded && isSignedIn ? "/chat" : "/sign-up";
    router.push(target);
  };

  // Enter — отправка, Shift+Enter — перенос строки.
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Ввод текста + авто-рост высоты поля.
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div
        className={cn(
          "glass-strong relative flex flex-col rounded-3xl p-2.5",
          "shadow-[0_18px_60px_-22px_rgba(7,27,77,0.4)]"
        )}
      >
        {/* Поле ввода вопроса */}
        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Спросите что угодно по учёбе…"
          rows={2}
          className="min-h-[72px] w-full resize-none bg-transparent px-3 py-2 text-[16px] leading-relaxed text-ink outline-none placeholder:text-muted"
        />

        {/* Кнопка отправки */}
        <div className="mt-1 flex items-center px-1">
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Отправить"
            className={cn(
              "ml-auto grid h-9 w-9 place-items-center rounded-full transition-colors",
              canSend
                ? "bg-[var(--brand-primary)] text-white shadow-[0_10px_24px_-10px_rgba(23,70,245,0.6)] hover:bg-[var(--brand-primary-hover)]"
                : "bg-[var(--brand-line)] text-muted"
            )}
          >
            <ArrowUp />
          </button>
        </div>
      </div>
    </div>
  );
}

// Иконка-стрелка «отправить».
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