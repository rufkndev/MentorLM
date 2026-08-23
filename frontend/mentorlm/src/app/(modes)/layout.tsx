/**
 * Layout приложения (защищённые режимы /chat, /code, /research).
 * Даёт общий каркас: сайдбар слева, контент режима по центру, аккаунт справа,
 * диалог настроек. Оборачивает всё в провайдеры настроек и списка диалогов.
 */

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeft } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccountMenu } from "@/components/mainapp/AccountMenu";
import { AppSidebar } from "@/components/mainapp/sidebar";
import { ConversationsProvider } from "@/components/mainapp/ConversationsProvider";
import { SettingsDialog } from "@/components/mainapp/settings";
import { TABS, type TabId } from "@/components/mainapp/settings/config";
import { SettingsProvider } from "@/components/mainapp/SettingsProvider";
import { SubscriptionProvider } from "@/components/mainapp/SubscriptionProvider";
import { VerifyEmailBanner } from "@/components/mainapp/VerifyEmailBanner";

/* Открывает диалог настроек, если в адресе есть ?settings=<вкладка>, и сразу
 * убирает параметр — иначе диалог возвращался бы при каждом «назад».
 * Отдельным компонентом, потому что useSearchParams требует границы Suspense,
 * а оборачивать в неё весь layout незачем. */
function SettingsDeepLink({ onOpen }: { onOpen: (tab: TabId) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("settings");

  useEffect(() => {
    if (!requested) return;
    // Сверяемся с реестром вкладок: чужое значение в адресе не должно
    // открывать пустой диалог.
    const tab = TABS.find((t) => t.id === requested);
    if (tab) onOpen(tab.id);
    router.replace(pathname, { scroll: false });
  }, [requested, onOpen, router, pathname]);

  return null;
}

// Каркас приложения: сайдбар + контент + аккаунт + настройки.
export default function ModesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Свёрнут/раскрыт сайдбар и открыт/закрыт диалог настроек.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<TabId | undefined>();

  // Мемоизируем: без этого эффект в SettingsDeepLink перезапускался бы на
  // каждый рендер layout'а, а он тут частый (сайдбар, диалог).
  const openSettingsAt = useCallback((tab: TabId = "general") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

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
        {/* Напоминание о неподтверждённой почте — в потоке, а не поверх:
            плавающая плашка перекрыла бы композер или меню аккаунта. */}
        <VerifyEmailBanner />
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
        {/* ЛК умеет вести сразу в нужный раздел настроек — «Подписка»,
            «Платежи» и т.д., поэтому принимает вкладку. */}
        <AccountMenu onOpenSettings={openSettingsAt} />
      </div>

        {/* Открытие настроек по ссылке ?settings=<вкладка>. На это
            рассчитывают письма биллинга: уведомление о списании обязано
            указывать способ отказа (п. 7.3 оферты), поэтому кнопка в письме
            ведёт прямо на вкладку «Подписка», а не «куда-нибудь в настройки». */}
        <Suspense fallback={null}>
          <SettingsDeepLink onOpen={openSettingsAt} />
        </Suspense>

        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialTab={settingsTab}
        />
      </div>
      </ConversationsProvider>
      </SubscriptionProvider>
    </SettingsProvider>
  );
}
