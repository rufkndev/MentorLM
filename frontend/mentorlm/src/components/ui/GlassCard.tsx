"use client";

import { useRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = HTMLAttributes<HTMLDivElement> & {
  as?: "div" | "article" | "section";
  children: ReactNode;
};

export function GlassCard({
  className,
  children,
  as: Tag = "div",
  ...rest
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${mx}%`);
    el.style.setProperty("--my", `${my}%`);
  };

  const Component = Tag as "div";
  return (
    <Component
      ref={ref}
      onMouseMove={handleMouseMove}
      className={cn("glass-card", className)}
      {...rest}
    >
      {children}
    </Component>
  );
}
