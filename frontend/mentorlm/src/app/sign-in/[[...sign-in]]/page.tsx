/**
 * Страница входа (/sign-in). Рендерит виджет Clerk SignIn.
 * После входа/регистрации перенаправляет в чат.
 */

import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { Mascot } from "@/components/ui/Mascot";

// Экран входа с формой Clerk по центру.
export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      {/* Брендовая шапка: маскот-линза + словесная марка, ссылка на главную */}
      <Link href="/" className="flex flex-col items-center gap-3">
        <Mascot size={78} expression="happy" float="fly" />
        <span className="text-[17px] font-semibold tracking-tight text-ink">
          Mentor<span className="text-[var(--brand-primary)]">LM</span>
        </span>
      </Link>
      <SignIn
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/chat"
        signUpForceRedirectUrl="/chat"
      />
    </main>
  );
}
