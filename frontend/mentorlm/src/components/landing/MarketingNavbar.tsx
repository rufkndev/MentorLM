"use client";

import Link from "next/link";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { nav } from "@/lib/landing-contents";

export function MarketingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  const { isLoaded, isSignedIn } = useAuth();
  const cta = isLoaded && isSignedIn ? nav.ctaAuthed : nav.ctaPrimary;

  useMotionValueEvent(scrollY, "change", (v) => {
    setScrolled(v > 8);
  });

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <motion.nav
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "pointer-events-auto relative flex w-full max-w-5xl items-center justify-between gap-4 rounded-full px-3 py-2 transition-shadow duration-300",
          "glass-strong",
          scrolled && "shadow-[0_18px_60px_-20px_rgba(7,27,77,0.25)]"
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-white/40 transition-colors"
        >
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {nav.links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="rounded-full px-4 py-2 text-sm text-ink-soft hover:text-ink hover:bg-white/55 transition-colors"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center">
          <Button href={cta.href} size="sm">
            {cta.label}
          </Button>
        </div>
      </motion.nav>
    </header>
  );
}
