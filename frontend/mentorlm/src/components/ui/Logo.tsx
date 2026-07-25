/**
 * Логотип Mentor LM: брендовый знак-линза (BrandMark) + словесная марка.
 * Используется в шапке/подвале лендинга и в сайдбаре приложения — единый знак
 * везде. Сама геометрия знака живёт в BrandMark (единый источник правды).
 */

import { BrandMark } from "@/components/ui/BrandMark";
import { cn } from "@/lib/cn";

// Логотип: знак-линза и словесная марка.
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* Брендовый знак-линза */}
      <BrandMark size={28} />
      {/* Текстовая часть логотипа */}
      <span className="text-[15px] font-semibold tracking-tight text-ink">
        Mentor<span className="text-[var(--brand-primary)]">LM</span>
      </span>
    </span>
  );
}
