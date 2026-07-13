"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useSettings } from "@/components/mainapp/SettingsProvider";
import { useConversations } from "@/components/mainapp/ConversationsProvider";
import { useApi } from "@/lib/api";
import { RETENTION_OPTIONS, type RetentionDays } from "@/lib/settings-contents";
import { DangerButton, Row, Section, SelectBox } from "../controls";

export function DataTab() {
  const { settings, update } = useSettings();
  const api = useApi();
  const { refresh } = useConversations();
  const { user } = useUser();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const deleteAllChats = () => {
    if (!window.confirm("Удалить все чаты безвозвратно?")) return;
    api
      .delete("/api/conversations/")
      .then(() => refresh())
      .catch(() => {});
  };

  // Полное удаление аккаунта: сначала стираем наши данные (пока токен валиден),
  // затем удаляем сам аккаунт Clerk — это разлогинивает и уводит на лендинг.
  const deleteAccount = async () => {
    if (!user || deleting) return;
    const ok = window.confirm(
      "Удалить аккаунт безвозвратно? Будут стёрты все чаты, настройки и память. " +
        "Это действие нельзя отменить.",
    );
    if (!ok) return;

    setDeleting(true);
    try {
      await api.delete("/api/me/"); // 1) наши данные (каскадом)
      await user.delete(); // 2) аккаунт Clerk (и выход из сессии)
      router.push("/");
    } catch {
      setDeleting(false);
      window.alert(
        "Не удалось удалить аккаунт. Попробуйте позже или напишите в поддержку.",
      );
    }
  };

  return (
    <Section title="Данные и приватность">
      <Row
        label="Автоудаление старых чатов"
        hint="Диалоги без активности дольше выбранного срока удаляются автоматически"
      >
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
          Опасная зона
        </p>
        <p className="mt-1 text-[12.5px] text-red-700/70 dark:text-red-300/60">
          Эти действия необратимы.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <DangerButton label="Удалить все чаты" onClick={deleteAllChats} />
          <DangerButton
            label={deleting ? "Удаление…" : "Удалить аккаунт"}
            onClick={deleteAccount}
            disabled={deleting}
          />
        </div>
      </div>
    </Section>
  );
}
