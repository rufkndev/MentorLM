import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  pauseOnHover?: boolean;
};

export function Marquee({ children, className, pauseOnHover = true }: Props) {
  return (
    <div className={cn("mask-fade-x relative overflow-hidden", className)}>
      <div
        className={cn(
          "flex w-max items-center gap-16 animate-marquee",
          pauseOnHover && "hover:[animation-play-state:paused]"
        )}
      >
        <div className="flex shrink-0 items-center gap-16">{children}</div>
        <div className="flex shrink-0 items-center gap-16" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
