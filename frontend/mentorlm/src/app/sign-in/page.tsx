/**
 * Страница входа (/sign-in). Форма «почта + пароль» поверх своей авторизации.
 * После успешного входа уводит туда, откуда пользователя сюда прислали
 * (?next=...), по умолчанию — в чат.
 */

"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthError, useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input, PasswordInput } from "@/components/ui/Input";
import { authContents } from "@/lib/auth-contents";

const t = authContents.signIn;

function SignInForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      // Только внутренние адреса: ?next=https://чужой.сайт превратил бы форму
      // входа в открытый редирект.
      const next = searchParams.get("next");
      router.replace(next?.startsWith("/") ? next : "/chat");
    } catch (err) {
      setError(
        err instanceof AuthError ? err.message : authContents.errors.unknown,
      );
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title={t.title}
      subtitle={t.subtitle}
      expression="happy"
      error={error}
      footerText={t.footerText}
      footerLink={t.footerLink}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label={authContents.fields.email.label}
          placeholder={authContents.fields.email.placeholder}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordInput
          label={authContents.fields.password.label}
          placeholder={authContents.fields.password.placeholder}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          type="submit"
          disabled={busy}
          magnetic={false}
          className="mt-1 w-full"
        >
          {busy ? t.submitting : t.submit}
        </Button>
      </form>
    </AuthCard>
  );
}

// useSearchParams требует Suspense — иначе страница уходит в клиентский рендер целиком.
export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
