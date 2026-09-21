/**
 * Страница режима «Чат» (/chat).
 * Тонкая обёртка: отдаёт общему ChatScreen сценарии и дефолт этого режима.
 */

"use client";

import { ChatScreen } from "@/components/mainapp/ChatScreen";
import { chatScenarios, chatDefaultScenarioId, modes } from "@/content/app";

// Экран чата со сценариями режима «Общий».
export default function ChatPage() {
  return (
    <ChatScreen
      scenarios={chatScenarios}
      defaultScenarioId={chatDefaultScenarioId}
      placeholder={modes.find((m) => m.id === "chat")?.placeholder}
    />
  );
}
