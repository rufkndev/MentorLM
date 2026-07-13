/**
 * Layout маркетинговых страниц (лендинг, /about, /blog, /legal и т.п.).
 * Оборачивает контент в общую навигацию сверху и футер снизу.
 */

import { MarketingNavbar } from "@/components/landing/MarketingNavbar";
import { MarketingFooter } from "@/components/landing/MarketingFooter";

// Каркас маркетинговых страниц: навбар + контент + футер.
export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen text-ink">
      {/* Верхняя навигация лендинга */}
      <MarketingNavbar />
      {/* Контент конкретной страницы */}
      <main>{children}</main>
      {/* Подвал лендинга */}
      <MarketingFooter />
    </div>
  );
}
