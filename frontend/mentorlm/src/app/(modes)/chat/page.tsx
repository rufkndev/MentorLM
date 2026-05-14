"use client";

import { ChatScreen } from "@/components/mainapp/ChatScreen";
import { chatScenarios, chatDefaultScenarioId } from "@/lib/mainapp-contents";

export default function ChatPage() {
  return (
    <ChatScreen
      scenarios={chatScenarios}
      defaultScenarioId={chatDefaultScenarioId}
      placeholder="Спросите что угодно по учёбе…"
    />
  );
}
