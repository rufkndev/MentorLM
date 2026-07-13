/**
 * Страница входа (/sign-in). Рендерит виджет Clerk SignIn.
 * После входа/регистрации перенаправляет в чат.
 */

import { SignIn } from "@clerk/nextjs";

// Экран входа с формой Clerk по центру.
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <SignIn
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/chat"
        signUpForceRedirectUrl="/chat"
      />
    </main>
  );
}
