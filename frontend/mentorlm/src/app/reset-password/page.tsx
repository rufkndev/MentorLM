/**
 * Страница смены пароля по ссылке из письма (/reset-password?token=…).
 *
 * Токен приходит в адресе и живёт только здесь: в localStorage мы его не
 * кладём и в сессию не превращаем. После успешной смены бэкенд гасит ВСЕ
 * сессии пользователя, поэтому локальную мы закрываем сами — иначе во вкладке
 * остался бы access-токен, который ещё четверть часа выглядит рабочим.
 */

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthError, useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/Input";
import { authContents } from "@/lib/auth-contents";
import { confirmPasswordReset } from "@/lib/auth-api";

const t = authContents.resetPassword;

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const { logout } = useAuth();

  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setRepeatError(null);

    // Совпадение паролей — защита от опечатки, бэкенд про повтор не знает.
    if (password !== repeat) {
      setRepeatError(authContents.errors.passwordMismatch);
      return;
    }

    setBusy(true);
    try {
      await confirmPasswordReset(token, password);
      // Сессии уже погашены на сервере — приводим вкладку в соответствие.
      await logout();
      setDone(true);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : authContents.errors.unknown);
      setBusy(false);
    }
  };

  // Ссылку открыли без токена (обрезалась при переносе строки в письме).
  if (!token) {
    return (
      <AuthCard
        title={t.title}
        subtitle={t.noToken}
        expression="calm"
        footerText={t.footerText}
        footerLink={t.footerLink}
      >
        <Button href="/forgot-password" magnetic={false} className="w-full">
          {t.expiredAction}
        </Button>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard
        title={t.doneTitle}
        subtitle={t.doneText}
        expression="happy"
        footerText={t.footerText}
        footerLink={t.footerLink}
      >
        <Button href="/sign-in" magnetic={false} className="w-full">
          {t.toSignIn}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t.title}
      subtitle={t.subtitle}
      expression="calm"
      error={error}
      footerText={t.footerText}
      footerLink={t.footerLink}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <PasswordInput
          label={authContents.fields.passwordNew.label}
          placeholder={authContents.fields.passwordNew.placeholder}
          hint={authContents.fields.passwordNew.hint}
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordInput
          label={authContents.fields.passwordRepeat.label}
          placeholder={authContents.fields.passwordRepeat.placeholder}
          autoComplete="new-password"
          required
          error={repeatError ?? undefined}
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value);
            if (repeatError) setRepeatError(null);
          }}
        />
        <Button type="submit" disabled={busy} magnetic={false} className="mt-1 w-full">
          {busy ? t.submitting : t.submit}
        </Button>
      </form>

      {/* Истёкшую или уже использованную ссылку исправит только новое письмо */}
      <p className="mt-4 text-center text-[13px] text-muted">
        <Link
          href="/forgot-password"
          className="underline-offset-4 hover:text-ink-soft hover:underline"
        >
          {t.expiredAction}
        </Link>
      </p>
    </AuthCard>
  );
}

// useSearchParams требует Suspense — иначе страница уходит в клиентский рендер целиком.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
