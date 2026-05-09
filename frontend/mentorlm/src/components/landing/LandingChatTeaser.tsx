"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import {
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/cn";

const DRAFT_KEY = "mentorlm:draft";

export function LandingChatTeaser() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = text.trim().length > 0 && !submitting;

  const handleSend = () => {
    if (!canSend) return;
    setSubmitting(true);
    try {
      sessionStorage.setItem(DRAFT_KEY, text.trim());
    } catch {
      /* sessionStorage может быть недоступен — не блокируем редирект */
    }
    const target = isLoaded && isSignedIn ? "/chat" : "/sign-up";
    router.push(target);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Спросите что угодно по учёбе…"
          rows={2}
          className="min-h-[72px] w-full resize-none bg-transparent px-3 py-2 text-[16px] leading-relaxed text-ink outline-none placeholder:text-muted"
        />

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
