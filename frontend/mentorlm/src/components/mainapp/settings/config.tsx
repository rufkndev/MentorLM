import {
  Brain,
  Cog,
  Cpu,
  CreditCard,
  Database,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { SETTINGS_TAB_LABELS as label } from "@/content/settings";
import { GeneralTab } from "./tabs/GeneralTab";
import { ModelTab } from "./tabs/ModelTab";
import { MemoryTab } from "./tabs/MemoryTab";
import { SubscriptionTab } from "./tabs/SubscriptionTab";
import { PaymentsTab } from "./tabs/PaymentsTab";
import { DataTab } from "./tabs/DataTab";

export type TabId =
  | "general"
  | "model"
  | "memory"
  | "subscription"
  | "payments"
  | "data";

/* Единый источник вкладок: метаданные для навигации + компонент-панель.
 * Добавить вкладку = добавить одну запись здесь и одну в TabId. */
export const TABS: {
  id: TabId;
  label: string;
  icon: LucideIcon;
  Panel: ComponentType;
}[] = [
  { id: "general", label: label.general, icon: Cog, Panel: GeneralTab },
  { id: "model", label: label.model, icon: Cpu, Panel: ModelTab },
  { id: "memory", label: label.memory, icon: Brain, Panel: MemoryTab },
  { id: "subscription", label: label.subscription, icon: CreditCard, Panel: SubscriptionTab },
  { id: "payments", label: label.payments, icon: Receipt, Panel: PaymentsTab },
  { id: "data", label: label.data, icon: Database, Panel: DataTab },
];
