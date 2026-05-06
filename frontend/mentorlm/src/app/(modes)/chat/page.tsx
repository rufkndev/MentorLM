"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChatComposer,
  type ComposerSubmit,
} from "@/components/mainapp/ChatComposer";
import { ChatEmpty, PromptSuggestions } from "@/components/mainapp/ChatEmpty";
import { ChatMessage, type Message } from "@/components/mainapp/ChatMessage";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleSubmit = ({ text, thinking }: ComposerSubmit) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const placeholder: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      thinking: true,
    };

    setMessages((prev) => [...prev, userMsg, placeholder]);

    /*
     * Имитация ответа модели — позже здесь будет SSE / стрим
     * с бэкенда. thinking=true даёт чуть большую задержку.
     */
    const delay = thinking ? 1400 : 700;
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id
            ? {
                ...m,
                thinking: false,
                content:
                  "Это пример ответа. Здесь будет потоковый ответ модели — я уже думаю над тем, как лучше объяснить и подобрать материалы под ваш вопрос.",
              }
            : m
        )
      );
    }, delay);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-1.5rem-3rem)] flex-col">
      <AnimatePresence mode="wait">
        {isEmpty ? (
          <motion.section
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32 }}
            className="flex flex-1 flex-col items-center justify-center px-6"
          >
            <ChatEmpty />
            <div className="mt-10 w-full">
              <ChatComposer
                variant="hero"
                onSubmit={handleSubmit}
                placeholder="Спросите что угодно по учёбе…"
              />
            </div>
            <PromptSuggestions
              onPick={(p) =>
                handleSubmit({
                  text: p,
                  scenarioId: "default",
                  thinking: false,
                  files: [],
                })
              }
            />
          </motion.section>
        ) : (
          <motion.section
            key="thread"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32 }}
            className="relative flex flex-1 flex-col overflow-hidden"
          >
            <div
              ref={threadRef}
              className="flex-1 overflow-y-auto px-4 [scrollbar-width:thin]"
            >
              <div className="mx-auto flex max-w-3xl flex-col gap-5 py-6">
                {messages.map((m) => (
                  <ChatMessage key={m.id} message={m} />
                ))}
              </div>
            </div>

            <div className="px-4 pb-5 pt-2">
              <ChatComposer onSubmit={handleSubmit} />
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
