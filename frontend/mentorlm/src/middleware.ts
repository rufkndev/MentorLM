/**
 * Заголовки безопасности, и только они.
 *
 * ⚠️ Раньше middleware в проекте не было намеренно — и это решение в силе для
 * АВТОРИЗАЦИИ: refresh-cookie живёт на пути /api/auth/ и помечена httpOnly,
 * middleware её не видит, а наличие cookie всё равно не доказывало бы, что
 * сессия жива. Проверка входа как была, так и остаётся в (modes)/layout.tsx.
 *
 * Здесь middleware нужен по другой причине: nonce для CSP обязан быть РАЗНЫМ на
 * каждый ответ, а сгенерировать его на запрос больше негде.
 *
 * Зачем CSP. Ответ модели рендерится как Markdown (components/mainapp/
 * Markdown.tsx), а в режиме «Исследовать» в него попадает пересказ чужих
 * страниц. Сейчас сырой HTML оттуда не исполняется, но защита держится на том,
 * что в рендер не подключён `rehype-raw`. CSP — второй рубеж, который переживёт
 * неудачный импорт. Плюс `frame-ancestors 'none'`: без него авторизованный
 * интерфейс чата помещался в чужой iframe (кликджекинг).
 *
 * ⚠️ Побочный эффект: корневой layout читает nonce через headers(), поэтому все
 * маршруты становятся динамическими — лендинг перестаёт отдаваться как статика.
 * Для одного VPS за nginx это приемлемо: SSR страницы лендинга дешевле, чем
 * работающий кликджекинг.
 */

import { NextResponse, type NextRequest } from "next/server";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
const isDev = process.env.NODE_ENV !== "production";

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic': скрипты, загруженные доверенным скриптом, тоже
    // доверенные — иначе пришлось бы перечислять чанки Next.js поимённо.
    // 'unsafe-eval' только в разработке: без него не работает React Refresh.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // 'unsafe-inline' вынужденно: Tailwind v4 и motion ставят инлайновые стили
    // на элементы. Инлайновый стиль — не исполнение кода, риск несопоставим.
    "style-src 'self' 'unsafe-inline'",
    // https: для картинок из ответов модели и найденных источников.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${API_ORIGIN ? ` ${API_ORIGIN}` : ""}`,
    // Оплата — это переход на сайт ЮKassa целиком, а не iframe и не форма.
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  // CSP кладём и в ЗАПРОС: по нему Next.js находит nonce и сам проставляет его
  // своим скриптам. Без этой строки собственные скрипты Next будут заблокированы.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
  );
  return response;
}

export const config = {
  matcher: [
    /*
     * Все страницы, кроме статики и картинок: им заголовки не нужны, а лишний
     * проход middleware на каждый чанк — это задержка на каждой навигации.
     * Префетчи Next.js (next/link) тоже пропускаем.
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
