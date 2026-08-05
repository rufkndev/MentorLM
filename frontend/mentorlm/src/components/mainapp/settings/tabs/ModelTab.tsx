"use client";

import { useSettings, type Settings } from "@/components/mainapp/SettingsProvider";
import {
  CREATIVITY_OPTIONS,
  LENGTH_PREF_OPTIONS,
  MODEL_MODE_FIELDS,
  MODEL_TIER_OPTIONS,
  REASONING_DEPTH_OPTIONS,
} from "@/lib/settings-contents";
import { Row, Section, SegmentedControl } from "../controls";

export function ModelTab() {
  const { settings, update } = useSettings();

  return (
    <div className="flex flex-col gap-7">
      <Section
        title="Модель ИИ"
        description="Выбор грейда модели ИИ для каждого режима."
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
        title="Стиль ответов"
        description="Применяется во всех режимах поверх выбранного сценария."
      >
        <Row
          label="Креативность"
          hint="Сдвигает «температуру» сценария к точным или к более свободным ответам"
        >
          <SegmentedControl
            value={settings.creativity}
            onChange={(creativity) => update({ creativity })}
            options={CREATIVITY_OPTIONS}
          />
        </Row>
        <Row
          label="Длина ответов"
          hint="Короче или подробнее"
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
          label="Глубина проработки"
          hint="Быстрее и проще или тщательнее с проверкой логики и ограничений"
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
