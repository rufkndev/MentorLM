"use client";

import { useState } from "react";
import Link from "next/link";
import { useSettings, type Settings } from "@/components/mainapp/SettingsProvider";
import { useSubscription } from "@/components/mainapp/SubscriptionProvider";
import {
  CREATIVITY_OPTIONS,
  LENGTH_PREF_OPTIONS,
  MODEL_MODE_FIELDS,
  MODEL_TIER_OPTIONS,
  REASONING_DEPTH_OPTIONS,
  modelTabCopy,
  tierLockedCopy,
} from "@/content/settings";
import type { ModelTier } from "@/types/settings";
import { Row, Section, SegmentedControl } from "../controls";

export function ModelTab() {
  const { settings, update } = useSettings();
  const { sub } = useSubscription();
  // Показали подсказку после клика по недоступному тиру — разовая реакция на
  // действие, поэтому живёт в состоянии диалога настроек, а не в хранилище.
  const [showLocked, setShowLocked] = useState(false);

  // Какие тиры тариф не разрешает. Список приходит с бэкенда вместе с тарифом:
  // выводить его из названия плана значило бы держать вторую копию каталога.
  // Пока тариф не загружен — не блокируем ничего, иначе на долю секунды
  // замок мигал бы платному пользователю.
  const lockedTiers = (
    sub
      ? MODEL_TIER_OPTIONS.map((o) => o.value).filter(
          (tier) => !sub.allowed_tiers.includes(tier),
        )
      : []
  ) as ModelTier[];

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
              locked={lockedTiers}
              onLocked={() => setShowLocked(true)}
            />
          </Row>
        ))}
        {showLocked && (
          <p className="text-[12.5px] text-ink-soft">
            {tierLockedCopy.text}{" "}
            <Link
              href="/billing"
              className="font-medium text-[var(--brand-primary)] underline underline-offset-2"
            >
              {tierLockedCopy.cta}
            </Link>
          </p>
        )}
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
