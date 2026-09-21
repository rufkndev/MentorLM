"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSettings } from "@/components/mainapp/SettingsProvider";
import { useConversations } from "@/components/mainapp/ConversationsProvider";
import { useApi } from "@/hooks/useApi";
import { RETENTION_OPTIONS, dataTabCopy as t } from "@/content/settings";
import type { RetentionDays } from "@/types/settings";
import { DangerButton, Row, Section, SelectBox } from "../controls";

export function DataTab() {
  const { settings, update } = useSettings();
  const api = useApi();
  const { refresh } = useConversations();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const deleteAllChats = () => {
    if (!window.confirm(t.deleteChatsConfirm)) return;
    api
      .delete("/api/conversations/")
      .then(() => refresh())
      .catch(() => {});
  };

  // Полное удаление аккаунта: бэкенд стирает профиль и всё связанное каскадом
  // (включая refresh-токены), затем закрываем локальную сессию и уходим на
  // лендинг. Это же реализация права на удаление ПДн — удаление настоящее.
  const deleteAccount = async () => {
    if (!user || deleting) return;
    const ok = window.confirm(t.deleteAccountConfirm);
    if (!ok) return;

    setDeleting(true);
    try {
      await api.delete("/api/me/"); // 1) аккаунт и все данные (каскадом)
      await logout(); // 2) гасим cookie и локальное состояние
      router.push("/");
    } catch {
      setDeleting(false);
      window.alert(t.deleteAccountError);
    }
  };

  return (
    <Section title={t.title}>
      <Row label={t.retention.label} hint={t.retention.hint}>
        <SelectBox
          value={String(settings.chat_retention_days)}
          onChange={(v) =>
            update({ chat_retention_days: Number(v) as RetentionDays })
          }
          options={RETENTION_OPTIONS.map((o) => ({
            value: String(o.value),
            label: o.label,
          }))}
        />
      </Row>

      <div className="mt-4 rounded-xl border border-red-200 bg-red-50/40 p-4 dark:border-red-500/25 dark:bg-red-500/10">
        <p className="text-[13.5px] font-medium text-red-700 dark:text-red-300">
          {t.dangerTitle}
        </p>
        <p className="mt-1 text-[12.5px] text-red-700/70 dark:text-red-300/60">
          {t.dangerDescription}
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <DangerButton label={t.deleteChats} onClick={deleteAllChats} />
          <DangerButton
            label={deleting ? t.deletingAccount : t.deleteAccount}
            onClick={deleteAccount}
            disabled={deleting}
          />
        </div>
      </div>
    </Section>
  );
}
