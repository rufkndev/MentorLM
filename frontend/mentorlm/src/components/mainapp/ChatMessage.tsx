"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { Markdown } from "@/components/mainapp/Markdown";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: boolean;
};

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
      {!isUser && <AssistantAvatar />}

      <div
        className={cn(
          "chat-text max-w-[78%] rounded-3xl px-4 py-3",
          isUser
            ? "whitespace-pre-wrap bg-[var(--brand-primary)] text-white shadow-[0_12px_28px_-14px_rgba(23,70,245,0.55)]"
            : "min-w-0 text-ink"
        )}
      >
        {message.thinking ? (
          <ThinkingDots />
        ) : isUser ? (
          message.content
        ) : (
          <Markdown content={message.content} />
        )}
      </div>
    </motion.div>
  );
}

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
