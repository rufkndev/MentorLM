import {
  Brain,
  Cog,
  Cpu,
  CreditCard,
  Database,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { GeneralTab } from "./tabs/GeneralTab";
import { ModelTab } from "./tabs/ModelTab";
import { MemoryTab } from "./tabs/MemoryTab";
import { SubscriptionTab } from "./tabs/SubscriptionTab";
import { DataTab } from "./tabs/DataTab";

export type TabId = "general" | "model" | "memory" | "subscription" | "data";

/* Единый источник вкладок: метаданные для навигации + компонент-панель.
 * Добавить вкладку = добавить одну запись здесь и одну в TabId. */
export const TABS: {
  id: TabId;
  label: string;
  icon: LucideIcon;
  Panel: ComponentType;
}[] = [
  { id: "general", label: "Общие", icon: Cog, Panel: GeneralTab },
  { id: "model", label: "Модель ИИ", icon: Cpu, Panel: ModelTab },
  { id: "memory", label: "Память", icon: Brain, Panel: MemoryTab },
  { id: "subscription", label: "Подписка", icon: CreditCard, Panel: SubscriptionTab },
  { id: "data", label: "Данные", icon: Database, Panel: DataTab },
];
