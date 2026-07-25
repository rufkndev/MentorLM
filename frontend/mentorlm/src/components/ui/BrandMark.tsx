/**
 * Брендовый знак Mentor LM — «стеклянный компаньон» (голова маскота).
 * Единый источник геометрии марки: используется логотипом (Logo) и статическим
 * favicon (app/icon.svg — рисуется той же геометрией). Согласован с маскотом
 * (components/ui/Mascot.tsx): та же стеклянная сфера + спокойное лицо.
 *
 * Стеклянная сфера (кобальт → deep), дуга-блик преломления, холодный focus-блик
 * и минималистичное лицо (два спокойных глаза + лёгкая улыбка). Читается и в
 * маленьком размере (фавикон 16px).
 *
 * Чистый компонент без хуков — можно рендерить и в серверных компонентах.
 * id-градиентов неймспейсим через `idPrefix`, одинаковые инстансы делят def.
 */

import { cn } from "@/lib/cn";

export function BrandMark({
  size = 28,
  className,
  title,
  idPrefix = "bm",
}: {
  size?: number;
  className?: string;
  /** Если задан — знак озвучивается для скринридеров, иначе скрыт (aria-hidden). */
  title?: string;
  idPrefix?: string;
}) {
  const sphere = `${idPrefix}-sphere`;
  const glassRim = `${idPrefix}-rim`;
  const ink = "#0A1B44";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        {/* Тело стеклянной сферы: свет сверху-слева → глубокий navy снизу-справа */}
        <linearGradient id={sphere} x1="7" y1="5" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3D6BFF" />
          <stop offset="0.5" stopColor="#1746F5" />
          <stop offset="1" stopColor="#071B4D" />
        </linearGradient>
        {/* Кромка стекла: светлый rim по периметру */}
        <linearGradient id={glassRim} x1="16" y1="3" x2="16" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.15" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {/* Стеклянная сфера */}
      <circle cx="16" cy="16" r="13" fill={`url(#${sphere})`} />
      {/* Светлая кромка преломления */}
      <circle cx="16" cy="16" r="13" fill="none" stroke={`url(#${glassRim})`} strokeWidth="1.1" />

      {/* Дуга-блик слева-сверху (световая траектория) */}
      <path
        d="M6.6 20.4A11 11 0 0 1 11 7.2"
        stroke="#FFFFFF"
        strokeOpacity="0.6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Холодный focus-блик справа-сверху */}
      <circle cx="21.6" cy="10" r="1.3" fill="#BFEFFF" fillOpacity="0.85" />

      {/* Лицо: два спокойных глаза + лёгкая улыбка */}
      <ellipse cx="12.7" cy="15.2" rx="1.5" ry="2.1" fill={ink} />
      <ellipse cx="19.3" cy="15.2" rx="1.5" ry="2.1" fill={ink} />
      <circle cx="12.2" cy="14.4" r="0.6" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="18.8" cy="14.4" r="0.6" fill="#FFFFFF" fillOpacity="0.9" />
      <path
        d="M12.9 19.4 Q16 21.8 19.1 19.4"
        stroke={ink}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
