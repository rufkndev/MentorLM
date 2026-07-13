/**
 * Страница регистрации (/sign-up). Рендерит виджет Clerk SignUp.
 * После регистрации/входа перенаправляет в чат.
 */

import { SignUp } from "@clerk/nextjs";

// Экран регистрации с формой Clerk по центру.
export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <SignUp
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/chat"
        signInForceRedirectUrl="/chat"
      />
    </main>
  );
}
