/**
 * Корневой layout приложения (App Router) — обёртка всех страниц.
 * Подключает шрифты, глобальные стили, SEO-метаданные и провайдер Clerk,
 * а также анти-FOUC скрипт, выставляющий тему и размер шрифта до отрисовки.
 */

import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkLocalization } from "@/lib/clerk-localization";
import { CookieNotice } from "@/components/ui/CookieNotice";
import { GlassFilters } from "@/components/ui/GlassFilters";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

// Основной шрифт интерфейса: Manrope — современный геометрический гротеск с
// родной кириллицей (её рисовал автор шрифта, а не «дотягивали» позже). Высокий
// x-height и открытые формы держат мелкий UI разборчивым, а средние веса
// (500–600) выглядят собранно и дорого — на них и построена вся иерархия
// названий чатов, режимов и заголовков. Вариант из дизайн-системы
// (dev_docs/branding_design/global.md). Переменный — один файл на все веса.
const sans = Manrope({
  variable: "--font-sans-src",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

// Моноширинный шрифт (код, метки).
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

// SEO-метаданные сайта по умолчанию.
export const metadata: Metadata = {
  title: {
    default: "Mentor LM — единая AI-платформа для учёбы",
    template: "%s · Mentor LM",
  },
  description:
    "Единое рабочее пространство для учёбы: чат, код, конспекты, разбор задач и поиск по материалам — без десятка вкладок и сервисов.",
  applicationName: "Mentor LM",
  keywords: [
    "AI для учёбы",
    "AI-платформа",
    "учебный AI",
    "Mentor LM",
    "AI-ассистент студента",
  ],
  metadataBase: new URL("https://mentorlm.ru"),
  openGraph: {
    title: "Mentor LM — единая AI-платформа для учёбы",
    description:
      "Один интерфейс для всех учебных задач. Чат, код, разбор материалов, конспекты.",
    type: "website",
    locale: "ru_RU",
  },
  // Иконки (favicon/apple-icon) и og:image подхватываются из app/icon.svg,
  // app/apple-icon.tsx и app/opengraph-image.tsx по file-convention Next.
};

// Цвет темы браузера и масштабирование вьюпорта.
export const viewport: Viewport = {
  themeColor: "#F6F7FB",
  width: "device-width",
  initialScale: 1,
};

// Разметка <html>/<body> со всеми провайдерами и глобальными настройками.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider localization={clerkLocalization}>
      <html
        lang="ru"
        className={`${sans.variable} ${jetbrains.variable}`}
        suppressHydrationWarning
      >
        <head>
          {/* Анти-FOUC: ставим тему и размер шрифта из localStorage
              синхронно, до первой отрисовки — чтобы не мигало. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{
                var t=localStorage.getItem('mentorlm-theme')||'system';
                var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
                document.documentElement.setAttribute('data-theme',dark?'dark':'light');
                var f=localStorage.getItem('mentorlm-font-size')||'md';
                document.documentElement.setAttribute('data-font-size',f);
              }catch(e){}})();`,
            }}
          />
        </head>
        <body className="min-h-screen text-ink antialiased font-sans">
          {/* SVG-фильтры преломления для «жидкого стекла» (см. GlassFilters) */}
          <GlassFilters />
          {children}
          <CookieNotice />
        </body>
      </html>
    </ClerkProvider>
  );
}
