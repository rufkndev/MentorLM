import { cn } from "@/lib/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-xl"
        style={{
          background:
            "conic-gradient(from 200deg at 50% 50%, #1746F5 0deg, #56D9FF 120deg, #7B61FF 240deg, #1746F5 360deg)",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.4), 0 6px 16px -6px rgba(23,70,245,0.6)",
        }}
      >
        <span className="absolute inset-[3px] rounded-[9px] bg-[var(--brand-paper)]" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">
        Mentor<span className="text-[var(--brand-primary)]">LM</span>
      </span>
    </span>
  );
}
