"use client";

import { ChatScreen } from "@/components/mainapp/ChatScreen";
import {
  researchScenarios,
  researchDefaultScenarioId,
} from "@/lib/mainapp-contents";

export default function ResearchPage() {
  return (
    <ChatScreen
      scenarios={researchScenarios}
      defaultScenarioId={researchDefaultScenarioId}
      placeholder="Что нужно исследовать?"
    />
  );
}
