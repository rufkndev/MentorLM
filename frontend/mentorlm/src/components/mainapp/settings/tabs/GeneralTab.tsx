"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSettings } from "@/components/mainapp/SettingsProvider";
import { generalTabCopy } from "@/content/settings";
import { Row, Section, SegmentedControl } from "../controls";

export function GeneralTab() {
  const { settings, update } = useSettings();

  return (
    <Section title={generalTabCopy.title}>
      <Row label={generalTabCopy.theme.label} hint={generalTabCopy.theme.hint}>
        <SegmentedControl
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { value: "system", label: generalTabCopy.themeOptions.system, icon: Monitor },
            { value: "light", label: generalTabCopy.themeOptions.light, icon: Sun },
            { value: "dark", label: generalTabCopy.themeOptions.dark, icon: Moon },
          ]}
        />
      </Row>
      <Row label={generalTabCopy.fontSize.label}>
        <SegmentedControl
          value={settings.font_size}
          onChange={(font_size) => update({ font_size })}
          options={[
            { value: "sm", label: generalTabCopy.fontSizeOptions.sm },
            { value: "md", label: generalTabCopy.fontSizeOptions.md },
            { value: "lg", label: generalTabCopy.fontSizeOptions.lg },
          ]}
        />
      </Row>
    </Section>
  );
}
