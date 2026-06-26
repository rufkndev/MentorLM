import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ruRU } from "@clerk/localizations";
import { Onest, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

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
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#F6F7FB",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider localization={ruRU}>
      <html
        lang="ru"
        className={`${onest.variable} ${jetbrains.variable}`}
        suppressHydrationWarning
      >
        <head>
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
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
