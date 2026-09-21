/**
 * Страница режима «Исследовать» (/research).
 * Тонкая обёртка: отдаёт общему ChatScreen сценарии и дефолт режима ресёрча.
 */

"use client";

import { ChatScreen } from "@/components/mainapp/ChatScreen";
import {
  researchScenarios,
  researchDefaultScenarioId,
  modes,
} from "@/content/app";

// Экран чата со сценариями режима «Исследовать».
export default function ResearchPage() {
  return (
    <ChatScreen
      scenarios={researchScenarios}
      defaultScenarioId={researchDefaultScenarioId}
      placeholder={modes.find((m) => m.id === "research")?.placeholder}
    />
  );
}
