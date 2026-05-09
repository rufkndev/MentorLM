"use client";

import Link from "next/link";
import { useMotionValue, useMotionValueEvent, useSpring } from "motion/react";
import { useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "glass";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 font-medium tracking-tight rounded-full select-none transition-[background-color,color,box-shadow] duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-paper)] disabled:opacity-50 disabled:pointer-events-none will-change-transform";

const springConfig = { stiffness: 180, damping: 22, mass: 0.5 } as const;

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-[52px] px-7 text-[16px]",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--brand-primary)] text-white shadow-[0_10px_28px_-10px_rgba(23,70,245,0.6)] hover:bg-[var(--brand-primary-hover)]",
  secondary:
    "bg-[var(--brand-ink)] text-white hover:bg-[var(--brand-ink-soft)]",
  ghost:
    "bg-transparent text-[var(--brand-ink)] hover:bg-[var(--brand-paper-2)]",
  glass: "glass-strong text-[var(--brand-ink)]",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  magnetic?: boolean;
};

type ButtonAsButton = CommonProps &
  ComponentPropsWithoutRef<"button"> & { href?: undefined };
type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<"a">, "href"> & { href: string };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const {
    variant = "primary",
    size = "md",
    className,
    children,
    magnetic = true,
    ...rest
  } = props;
  const ref = useRef<HTMLAnchorElement & HTMLButtonElement>(null);

  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const sx = useSpring(tx, springConfig);
  const sy = useSpring(ty, springConfig);

  useMotionValueEvent(sx, "change", (v) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `translate(${v}px, ${sy.get()}px)`;
  });
  useMotionValueEvent(sy, "change", (v) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `translate(${sx.get()}px, ${v}px)`;
  });

  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!magnetic) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    tx.set((e.clientX - r.left - r.width / 2) * 0.18);
    ty.set((e.clientY - r.top - r.height / 2) * 0.22);
  };

  const onMouseLeave = () => {
    if (!magnetic) return;
    tx.set(0);
    ty.set(0);
  };

  const classes = cn(base, sizes[size], variants[variant], className);

  if ("href" in rest && rest.href) {
    const { href, ...anchor } = rest as ButtonAsLink;
    return (
      <Link
        ref={ref}
        href={href}
        className={classes}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        {...anchor}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      ref={ref}
      className={classes}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      {...(rest as ButtonAsButton)}
    >
      {children}
    </button>
  );
}
