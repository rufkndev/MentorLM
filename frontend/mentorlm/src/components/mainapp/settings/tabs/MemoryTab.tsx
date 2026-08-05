"use client";

import { useSettings } from "@/components/mainapp/SettingsProvider";
import {
  CONTEXT_DEPTH_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  MEMORY_SCOPE_OPTIONS,
  MEMORY_USE_OPTIONS,
  type EducationLevel,
} from "@/lib/settings-contents";
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
      <Section
        title="О вас"
        description="Модель учитывает это в каждом разговоре, чтобы подбирать примеры и уровень объяснений. Можно оставить пустым."
      >
        <Row label="Как к вам обращаться" hint="Имя или ник для ответов модели">
          <TextInput
            value={settings.nickname}
            onChange={(nickname) => update({ nickname })}
            placeholder="Например: Босс"
          />
        </Row>
        <Row label="Чем вы занимаетесь" hint="Помогает подбирать примеры">
          <TextInput
            value={settings.occupation}
            onChange={(occupation) => update({ occupation })}
            placeholder="Например: студент-программист"
          />
        </Row>
        <Row label="Уровень обучения" hint="Влияет на глубину объяснений и терминологию">
          <SelectBox
            value={settings.education_level}
            onChange={(v) =>
              update({ education_level: v as EducationLevel })
            }
            options={EDUCATION_LEVEL_OPTIONS}
          />
        </Row>
        <Row
          label="Направление / специальность"
          hint="Помогает подбирать предметные примеры"
        >
          <TextInput
            value={settings.field_of_study}
            onChange={(field_of_study) => update({ field_of_study })}
            placeholder="Например: Инженер ПО"
          />
        </Row>
        <Field
          label="Цели обучения"
          hint="Например: подготовиться к экзамену, закрыть практические работы, разобраться в алгоритмах"
        >
          <Textarea
            value={settings.learning_goals}
            onChange={(learning_goals) => update({ learning_goals })}
            placeholder="Чего вы хотите достичь…"
            rows={3}
          />
        </Field>
        <Field
          label="Что ещё важно знать о вас"
          hint="Например: студент 3 курса CS; интересуют ML и алгоритмы; учу английский"
        >
          <Textarea
            value={settings.custom_about}
            onChange={(custom_about) => update({ custom_about })}
            placeholder="Расскажите о себе, своей учёбе и интересах…"
            rows={4}
          />
        </Field>
        <Field
          label="Как вы хотите получать ответы"
          hint="Например: короче, с примерами кода, без воды"
        >
          <Textarea
            value={settings.custom_style}
            onChange={(custom_style) => update({ custom_style })}
            placeholder="Опишите предпочитаемый стиль ответов…"
            rows={4}
          />
        </Field>
      </Section>

      <Section
        title="Память диалога"
        description="Сколько прошлого контекста учитывать."
      >
        <Row
          label="Глубина памяти"
          hint="Больше истории — точнее для сложных задач, но дороже и медленнее"
        >
          <SegmentedControl
            value={settings.context_depth}
            onChange={(context_depth) => update({ context_depth })}
            options={CONTEXT_DEPTH_OPTIONS}
          />
        </Row>
      </Section>

      <Section
        title="Долговременная память"
        description="Устойчивые факты о вас, которые модель запоминает между чатами и учитывает в ответах. Ниже их можно посмотреть и удалить."
      >
        <Row
          label="Автоматическая память"
          hint="Разрешить модели самой запоминать полезные факты о вас"
        >
          <Toggle
            checked={settings.auto_memory}
            onChange={(auto_memory) => update({ auto_memory })}
          />
        </Row>
        <Row
          label="Объём автопамяти"
          hint="Насколько подробно запоминать учебный контекст"
        >
          <SegmentedControl
            value={settings.memory_scope}
            onChange={(memory_scope) => update({ memory_scope })}
            options={MEMORY_SCOPE_OPTIONS}
          />
        </Row>
        <Row
          label="Использование памяти"
          hint="Насколько активно подмешивать сохранённые факты в ответы"
        >
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
