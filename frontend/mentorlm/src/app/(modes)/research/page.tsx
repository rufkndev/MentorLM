/**
 * Страница режима «Исследовать» (/research).
 * Тонкая обёртка: отдаёт общему ChatScreen сценарии и дефолт режима ресёрча.
 */

"use client";

import { ChatScreen } from "@/components/mainapp/ChatScreen";
import {
  researchScenarios,
  researchDefaultScenarioId,
} from "@/lib/mainapp-contents";

// Экран чата со сценариями режима «Исследовать».
export default function ResearchPage() {
  return (
    <ChatScreen
      scenarios={researchScenarios}
      defaultScenarioId={researchDefaultScenarioId}
      placeholder="Что нужно исследовать?"
    />
  );
}
