/**
 * Страница регистрации (/sign-up). Рендерит виджет Clerk SignUp.
 * После регистрации/входа перенаправляет в чат.
 */

import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Mascot } from "@/components/ui/Mascot";

// Экран регистрации с формой Clerk по центру.
export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      {/* Брендовая шапка: маскот-линза + словесная марка, ссылка на главную */}
      <Link href="/" className="flex flex-col items-center gap-3">
        <Mascot size={78} expression="calm" float="fly" />
        <span className="text-[17px] font-semibold tracking-tight text-ink">
          Mentor<span className="text-[var(--brand-primary)]">LM</span>
        </span>
      </Link>
      <SignUp
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/chat"
        signInForceRedirectUrl="/chat"
      />
    </main>
  );
}
