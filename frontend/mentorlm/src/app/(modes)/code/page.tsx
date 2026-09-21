/**
 * Страница режима «Код» (/code).
 * Тонкая обёртка: отдаёт общему ChatScreen сценарии и дефолт режима кода.
 */

"use client";

import { ChatScreen } from "@/components/mainapp/ChatScreen";
import { codeScenarios, codeDefaultScenarioId, modes } from "@/content/app";

// Экран чата со сценариями режима «Код».
export default function CodePage() {
  return (
    <ChatScreen
      scenarios={codeScenarios}
      defaultScenarioId={codeDefaultScenarioId}
      placeholder={modes.find((m) => m.id === "code")?.placeholder}
    />
  );
}
