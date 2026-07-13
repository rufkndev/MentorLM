/**
 * Экран чата — общий для режимов Чат/Код/Исследовать.
 * Показывает либо пустой экран с hero-композером, либо тред сообщений с
 * композером внизу. Вся логика (история, стриминг, отправка) — в useChatSession.
 */

"use client";

import { Suspense } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChatComposer } from "@/components/mainapp/ChatComposer";
import { ChatEmpty } from "@/components/mainapp/ChatEmpty";
import { ChatMessage } from "@/components/mainapp/ChatMessage";
import { useChatSession } from "@/components/mainapp/useChatSession";
import type { Scenario } from "@/lib/mainapp-contents";

type Props = {
  scenarios: readonly Scenario[];
  defaultScenarioId: string;
  placeholder?: string;
};

// Внешняя обёртка с Suspense (нужен для useSearchParams при сборке).
export function ChatScreen(props: Props) {
  return (
    <Suspense fallback={<div className="h-[calc(100vh-1.5rem)]" />}>
      <ChatScreenInner {...props} />
    </Suspense>
  );
}

// Внутренний экран: берёт состояние из хука и рисует пустой экран или тред.
function ChatScreenInner({
  scenarios,
  defaultScenarioId,
  placeholder,
}: Props) {
  const {
    messages,
    sending,
    scenarioId,
    setScenarioId,
    threadRef,
    handleSubmit,
    isEmpty,
  } = useChatSession(defaultScenarioId);

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      <AnimatePresence mode="wait">
        {/* Пустой экран: приветствие + большой композер по центру */}
        {isEmpty ? (
          <motion.section
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex flex-1 flex-col items-center justify-center px-6"
          >
            <ChatEmpty />
            <div className="mt-10 w-full">
              <ChatComposer
                variant="hero"
                seedDraft
                scenarios={scenarios}
                scenarioId={scenarioId}
                onScenarioChange={setScenarioId}
                onSubmit={handleSubmit}
                placeholder={placeholder}
                disabled={sending}
              />
            </div>
          </motion.section>
        ) : (
          /* Тред: лента сообщений сверху + композер-док снизу */
          <motion.section
            key="thread"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="relative flex flex-1 flex-col overflow-hidden"
          >
            {/* Прокручиваемая лента сообщений */}
            <div
              ref={threadRef}
              className="flex-1 overflow-y-auto px-4 [scrollbar-width:thin]"
            >
              <div className="mx-auto flex max-w-5xl flex-col gap-5 py-6">
                {messages.map((m) => (
                  <ChatMessage key={m.id} message={m} />
                ))}
              </div>
            </div>

            {/* Композер внизу треда */}
            <div className="px-4 pb-5 pt-2">
              <ChatComposer
                scenarios={scenarios}
                scenarioId={scenarioId}
                onScenarioChange={setScenarioId}
                onSubmit={handleSubmit}
                placeholder={placeholder}
                disabled={sending}
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
