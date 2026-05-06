"use client";

import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { modes } from "@/lib/mainapp-contents";

type Props = {
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
};

export function AppNavbar({ onToggleSidebar, sidebarOpen }: Props) {
  const pathname = usePathname();
  const activeMode = modes.find((m) => pathname?.startsWith(m.href));

  return (
    <header className="pointer-events-none sticky top-0 z-40 px-3 pt-3">
      <div
        className={cn(
          "glass-strong pointer-events-auto mx-auto flex h-12 items-center justify-between gap-3 rounded-full px-3"
        )}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Скрыть сайдбар" : "Показать сайдбар"}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-white/55 hover:text-ink"
          >
            <SidebarIcon open={sidebarOpen ?? true} />
          </button>
          <Logo className="hidden sm:inline-flex" />
        </div>

        <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-soft">
          {activeMode && (
            <>
              <span className="truncate font-medium text-ink">
                {activeMode.label}
              </span>
              <span className="hidden text-muted sm:inline">·</span>
              <span className="hidden truncate text-muted sm:inline">
                {activeMode.hint}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <PlanBadge plan="Free" />
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-8 w-8 ring-1 ring-white/60",
              },
            }}
          />
        </div>
      </div>
    </header>
  );
}

function PlanBadge({ plan }: { plan: "Free" | "Pro" | "Premium" }) {
  const styles: Record<typeof plan, string> = {
    Free: "bg-white/55 text-ink-soft",
    Pro: "bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]",
    Premium:
      "bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-violet)] text-white",
  };
  return (
    <span
      className={cn(
        "hidden rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest sm:inline",
        styles[plan]
      )}
    >
      {plan}
    </span>
  );
}

function SidebarIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <line
        x1="6.5"
        y1="3"
        x2="6.5"
        y2="13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeOpacity={open ? 1 : 0.4}
      />
    </svg>
  );
}
