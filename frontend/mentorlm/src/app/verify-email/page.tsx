/**
 * Страница подтверждения почты (/verify-email?token=…).
 *
 * Единственный экран приложения, который делает запрос сам, без нажатия:
 * человек уже нажал — в письме. Токен уходит на бэкенд POST-запросом, а не
 * GET-ссылкой прямо в API: письма прогоняют через антивирусы и превью-роботов,
 * которые открывают все ссылки подряд, и по GET почта подтверждалась бы без
 * участия человека, а одноразовый токен сгорал бы до того, как тот прочтёт письмо.
 */

"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthError, useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { authContents } from "@/lib/auth-contents";
import { confirmEmailVerification } from "@/lib/auth-api";

const t = authContents.verifyEmail;

type State = "checking" | "ok" | "fail";

function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const { isSignedIn, getToken } = useAuth();

  const [state, setState] = useState<State>(token ? "checking" : "fail");
  const [error, setError] = useState<string | null>(token ? null : t.noToken);

  // Токен одноразовый, поэтому подтверждаем ровно один раз за жизнь страницы.
  // Без этого StrictMode в разработке дважды выполнил бы эффект, и второй
  // запрос вернул бы «ссылка уже использована» — на пустом месте.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;

    confirmEmailVerification(token)
      .then(async () => {
        setState("ok");
        // Профиль в памяти вкладки ещё считает почту неподтверждённой —
        // перечитываем сессию, чтобы напоминание пропало сразу.
        if (isSignedIn) await getToken(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof AuthError ? err.message : authContents.errors.unknown);
        setState("fail");
      });
  }, [token, isSignedIn, getToken]);

  if (state === "checking") {
    return (
      <AuthCard
        title={t.title}
        subtitle={t.checking}
        expression="calm"
        footerText={t.footerText}
        footerLink={t.footerLink}
      >
        {/* Три пульсирующие точки: ожидание короткое, спиннер был бы громко */}
        <div className="flex justify-center gap-1.5 py-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--brand-primary)]"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </AuthCard>
    );
  }

  const ok = state === "ok";
  return (
    <AuthCard
      title={ok ? t.doneTitle : t.failTitle}
      subtitle={ok ? t.doneText : t.failText}
      expression={ok ? "happy" : "calm"}
      error={ok ? null : error}
      footerText={authContents.signIn.footerText}
      footerLink={authContents.signIn.footerLink}
    >
      <Button
        href={isSignedIn ? "/chat" : "/sign-in"}
        magnetic={false}
        className="w-full"
      >
        {isSignedIn ? t.toApp : t.toSignIn}
      </Button>
    </AuthCard>
  );
}

// useSearchParams требует Suspense — иначе страница уходит в клиентский рендер целиком.
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}
