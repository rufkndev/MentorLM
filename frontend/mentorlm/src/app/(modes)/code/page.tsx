"use client";

import { ChatScreen } from "@/components/mainapp/ChatScreen";
import { codeScenarios, codeDefaultScenarioId } from "@/lib/mainapp-contents";

export default function CodePage() {
  return (
    <ChatScreen
      scenarios={codeScenarios}
      defaultScenarioId={codeDefaultScenarioId}
      placeholder="Вставьте код или опишите задачу…"
    />
  );
}
