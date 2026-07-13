"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSettings } from "@/components/mainapp/SettingsProvider";
import { Row, Section, SegmentedControl } from "../controls";

export function GeneralTab() {
  const { settings, update } = useSettings();

  return (
    <Section title="Общие">
      <Row label="Тема" hint="Светлая, тёмная или как в системе">
        <SegmentedControl
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { value: "system", label: "Системная", icon: Monitor },
            { value: "light", label: "Светлая", icon: Sun },
            { value: "dark", label: "Тёмная", icon: Moon },
          ]}
        />
      </Row>
      <Row label="Размер шрифта в чате">
        <SegmentedControl
          value={settings.font_size}
          onChange={(font_size) => update({ font_size })}
          options={[
            { value: "sm", label: "Мелкий" },
            { value: "md", label: "Средний" },
            { value: "lg", label: "Крупный" },
          ]}
        />
      </Row>
    </Section>
  );
}
