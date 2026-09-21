"use client";

import { useSettings } from "@/components/mainapp/SettingsProvider";
import {
  CONTEXT_DEPTH_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  MEMORY_SCOPE_OPTIONS,
  MEMORY_USE_OPTIONS,
  memoryTabCopy as t,
} from "@/content/settings";
import { PERSONA_LIMITS } from "@/lib/limits";
import type { EducationLevel } from "@/types/settings";
import {
  Field,
  Row,
  Section,
  SegmentedControl,
  SelectBox,
  Textarea,
  TextInput,
  Toggle,
} from "../controls";
import { SavedFacts } from "./SavedFacts";

export function MemoryTab() {
  const { settings, update } = useSettings();

  return (
    <div className="flex flex-col gap-7">
      <Section title={t.personaTitle} description={t.personaDescription}>
        <Row label={t.nickname.label} hint={t.nickname.hint}>
          <TextInput
            value={settings.nickname}
            onChange={(nickname) => update({ nickname })}
            placeholder={t.nickname.placeholder}
            maxLength={PERSONA_LIMITS.nickname}
          />
        </Row>
        <Row label={t.occupation.label} hint={t.occupation.hint}>
          <TextInput
            value={settings.occupation}
            onChange={(occupation) => update({ occupation })}
            placeholder={t.occupation.placeholder}
            maxLength={PERSONA_LIMITS.occupation}
          />
        </Row>
        <Row label={t.educationLevel.label} hint={t.educationLevel.hint}>
          <SelectBox
            value={settings.education_level}
            onChange={(v) =>
              update({ education_level: v as EducationLevel })
            }
            options={EDUCATION_LEVEL_OPTIONS}
          />
        </Row>
        <Row label={t.fieldOfStudy.label} hint={t.fieldOfStudy.hint}>
          <TextInput
            value={settings.field_of_study}
            onChange={(field_of_study) => update({ field_of_study })}
            placeholder={t.fieldOfStudy.placeholder}
            maxLength={PERSONA_LIMITS.field_of_study}
          />
        </Row>
        <Field label={t.learningGoals.label} hint={t.learningGoals.hint}>
          <Textarea
            value={settings.learning_goals}
            onChange={(learning_goals) => update({ learning_goals })}
            placeholder={t.learningGoals.placeholder}
            maxLength={PERSONA_LIMITS.learning_goals}
            rows={3}
          />
        </Field>
        <Field label={t.customAbout.label} hint={t.customAbout.hint}>
          <Textarea
            value={settings.custom_about}
            onChange={(custom_about) => update({ custom_about })}
            placeholder={t.customAbout.placeholder}
            maxLength={PERSONA_LIMITS.custom_about}
            rows={4}
          />
        </Field>
        <Field label={t.customStyle.label} hint={t.customStyle.hint}>
          <Textarea
            value={settings.custom_style}
            onChange={(custom_style) => update({ custom_style })}
            placeholder={t.customStyle.placeholder}
            maxLength={PERSONA_LIMITS.custom_style}
            rows={4}
          />
        </Field>
      </Section>

      <Section title={t.contextTitle} description={t.contextDescription}>
        <Row label={t.contextDepth.label} hint={t.contextDepth.hint}>
          <SegmentedControl
            value={settings.context_depth}
            onChange={(context_depth) => update({ context_depth })}
            options={CONTEXT_DEPTH_OPTIONS}
          />
        </Row>
      </Section>

      <Section title={t.longTermTitle} description={t.longTermDescription}>
        <Row label={t.autoMemory.label} hint={t.autoMemory.hint}>
          <Toggle
            checked={settings.auto_memory}
            onChange={(auto_memory) => update({ auto_memory })}
          />
        </Row>
        <Row label={t.memoryScope.label} hint={t.memoryScope.hint}>
          <SegmentedControl
            value={settings.memory_scope}
            onChange={(memory_scope) => update({ memory_scope })}
            options={MEMORY_SCOPE_OPTIONS}
          />
        </Row>
        <Row label={t.memoryUse.label} hint={t.memoryUse.hint}>
          <SegmentedControl
            value={settings.memory_use}
            onChange={(memory_use) => update({ memory_use })}
            options={MEMORY_USE_OPTIONS}
          />
        </Row>
        <SavedFacts />
      </Section>
    </div>
  );
}
