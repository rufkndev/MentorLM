/**
 * Layout приложения (защищённые режимы /chat, /code, /research).
 * Даёт общий каркас: сайдбар слева, контент режима по центру, аккаунт справа,
 * диалог настроек. Оборачивает всё в провайдеры настроек и списка диалогов.
 */

"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeft } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccountMenu } from "@/components/mainapp/AccountMenu";
import { AppSidebar } from "@/components/mainapp/sidebar";
import { ConversationsProvider } from "@/components/mainapp/ConversationsProvider";
import { SettingsDialog } from "@/components/mainapp/settings";
import { SettingsProvider } from "@/components/mainapp/SettingsProvider";
import { SubscriptionProvider } from "@/components/mainapp/SubscriptionProvider";

// Каркас приложения: сайдбар + контент + аккаунт + настройки.
export default function ModesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Свёрнут/раскрыт сайдбар и открыт/закрыт диалог настроек.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Защита маршрутов живёт здесь, а не в middleware: cookie сессии — httpOnly и
  // ограничена путём /api/auth/, middleware её всё равно не увидит, а само по
  // себе наличие cookie ещё не означает, что сессия жива.
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anon") {
      // Запоминаем, куда пользователь шёл: после входа вернём его туда же.
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  // Пока сессия восстанавливается — не рисуем ничего: показать приложение
  // нельзя (данных нет), увести на вход тоже (может оказаться, что вход есть).
  if (status !== "authed") return null;

  return (
    <SettingsProvider>
      <SubscriptionProvider>
      <ConversationsProvider>
      <div className="relative flex min-h-screen text-ink">
      {/* Сайдбар со списком чатов и навигацией по режимам */}
      <Suspense fallback={null}>
        <AppSidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </Suspense>

      {/* Область контента активного режима */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="relative flex-1">{children}</main>
      </div>

      {/* плавающая кнопка раскрытия сайдбара (когда он свёрнут) */}
      <AnimatePresence>
        {!sidebarOpen && (
          <motion.div
            key="open-sidebar"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed left-3 top-3 z-40"
          >
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Показать сайдбар"
              title="Показать сайдбар"
              className="glass-strong grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors hover:text-ink"
            >
              <PanelLeft className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* аккаунт справа сверху */}
      <div className="fixed right-3 top-3 z-40">
        <AccountMenu onOpenSettings={() => setSettingsOpen(true)} />
      </div>

        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
      </ConversationsProvider>
      </SubscriptionProvider>
    </SettingsProvider>
  );
}
