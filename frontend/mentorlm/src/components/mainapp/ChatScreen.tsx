"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChatComposer,
  type ComposerSubmit,
} from "@/components/mainapp/ChatComposer";
import { ChatEmpty } from "@/components/mainapp/ChatEmpty";
import { ChatMessage, type Message } from "@/components/mainapp/ChatMessage";
import type { Scenario } from "@/lib/mainapp-contents";

type Props = {
  scenarios: readonly Scenario[];
  defaultScenarioId: string;
  greeting?: string;
  placeholder?: string;
};

export function ChatScreen({
  scenarios,
  defaultScenarioId,
  greeting,
  placeholder,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleSubmit = ({ text }: ComposerSubmit) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const placeholderMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      thinking: true,
    };

    setMessages((prev) => [...prev, userMsg, placeholderMsg]);

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderMsg.id
            ? {
                ...m,
                thinking: false,
                content:
                  "Это пример ответа. Здесь будет потоковый ответ модели — я уже думаю над тем, как лучше объяснить и подобрать материалы под ваш вопрос.",
              }
            : m
        )
      );
    }, 900);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
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
            <ChatEmpty greeting={greeting} />
            <div className="mt-10 w-full">
              <ChatComposer
                variant="hero"
                scenarios={scenarios}
                defaultScenarioId={defaultScenarioId}
                onSubmit={handleSubmit}
                placeholder={placeholder}
              />
            </div>
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
              <ChatComposer
                scenarios={scenarios}
                defaultScenarioId={defaultScenarioId}
                onSubmit={handleSubmit}
                placeholder={placeholder}
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
