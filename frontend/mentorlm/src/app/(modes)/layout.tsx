"use client";

import { useState } from "react";
import { AppNavbar } from "@/components/mainapp/AppNavbar";
import { AppSidebar } from "@/components/mainapp/AppSidebar";

export default function ModesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="relative flex min-h-screen text-ink">
      <AppSidebar open={sidebarOpen} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppNavbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
        <main className="relative flex-1">{children}</main>
      </div>
    </div>
  );
}
