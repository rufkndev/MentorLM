"use client";

import { Suspense, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeft } from "lucide-react";
import { AppSidebar } from "@/components/mainapp/AppSidebar";
import { ConversationsProvider } from "@/components/mainapp/ConversationsProvider";
import { SettingsDialog } from "@/components/mainapp/SettingsDialog";
import { SettingsProvider } from "@/components/mainapp/SettingsProvider";

export default function ModesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <SettingsProvider>
      <ConversationsProvider>
      <div className="relative flex min-h-screen text-ink">
      <Suspense fallback={null}>
        <AppSidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </Suspense>

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
        <UserButton
          appearance={{
            elements: {
              avatarBox:
                "h-10 w-10 ring-1 ring-white/60 shadow-[0_8px_22px_-10px_rgba(7,27,77,0.25)]",
            },
          }}
        />
      </div>

        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
      </ConversationsProvider>
    </SettingsProvider>
  );
}
