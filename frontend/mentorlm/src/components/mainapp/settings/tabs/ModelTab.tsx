"use client";

import { useSettings, type Settings } from "@/components/mainapp/SettingsProvider";
import {
  CREATIVITY_OPTIONS,
  LENGTH_PREF_OPTIONS,
  MODEL_MODE_FIELDS,
  MODEL_TIER_OPTIONS,
  REASONING_DEPTH_OPTIONS,
  modelTabCopy,
} from "@/content/settings";
import { Row, Section, SegmentedControl } from "../controls";

export function ModelTab() {
  const { settings, update } = useSettings();

  return (
    <div className="flex flex-col gap-7">
      <Section
        title={modelTabCopy.modelsTitle}
        description={modelTabCopy.modelsDescription}
      >
        {MODEL_MODE_FIELDS.map((f) => (
          <Row key={f.key} label={f.label} hint={f.hint}>
            <SegmentedControl
              value={settings[f.key]}
              onChange={(v) => update({ [f.key]: v } as Partial<Settings>)}
              options={MODEL_TIER_OPTIONS}
            />
          </Row>
        ))}
      </Section>

      <Section
        title={modelTabCopy.styleTitle}
        description={modelTabCopy.styleDescription}
      >
        <Row
          label={modelTabCopy.creativity.label}
          hint={modelTabCopy.creativity.hint}
        >
          <SegmentedControl
            value={settings.creativity}
            onChange={(creativity) => update({ creativity })}
            options={CREATIVITY_OPTIONS}
          />
        </Row>
        <Row
          label={modelTabCopy.length.label}
          hint={modelTabCopy.length.hint}
        >
          <SegmentedControl
            value={settings.response_length_preference}
            onChange={(response_length_preference) =>
              update({ response_length_preference })
            }
            options={LENGTH_PREF_OPTIONS}
          />
        </Row>
        <Row
          label={modelTabCopy.reasoning.label}
          hint={modelTabCopy.reasoning.hint}
        >
          <SegmentedControl
            value={settings.reasoning_depth}
            onChange={(reasoning_depth) => update({ reasoning_depth })}
            options={REASONING_DEPTH_OPTIONS}
          />
        </Row>
      </Section>
    </div>
  );
}
