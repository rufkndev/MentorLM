/**
 * Утилита cn — склейка CSS-классов Tailwind.
 * Используется во всех компонентах для объединения условных классов
 * без конфликтов (tailwind-merge убирает дубли вроде "p-2 p-4" → "p-4").
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Объединяет классы и разрешает конфликты Tailwind в пользу последнего.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
