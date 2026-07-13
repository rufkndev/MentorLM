/**
 * Middleware Next.js: защита маршрутов через Clerk.
 * Оборачивает все запросы в clerkMiddleware и требует авторизацию для приватных разделов приложения.
 * Новый защищённый режим = добавить его в isProtectedRoute ниже.
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Маршруты приложения, требующие входа.
const isProtectedRoute = createRouteMatcher(['/chat(.*)', '/app(.*)', '/code(.*)', '/research(.*)'])

// На каждый запрос: если маршрут приватный — требуем авторизацию.
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

// На каких путях запускать middleware (пропускаем статику и файлы Next).
export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
