/**
 * Страница «Забыли пароль?» (/forgot-password) — запрос письма со ссылкой.
 *
 * Экран успеха намеренно уклончив: «если аккаунт есть — письмо отправлено».
 * Бэкенд отвечает одинаково на существующий и несуществующий адрес, чтобы
 * форма не превращалась в проверку, кто у нас зарегистрирован, — и текст
 * здесь не должен сдавать то, что бэкенд бережно скрывает.
 */

"use client";

import { useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthError } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { authContents } from "@/lib/auth-contents";
import { requestPasswordReset } from "@/lib/auth-api";

const t = authContents.forgotPassword;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : authContents.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthCard
        title={t.sentTitle}
        subtitle={t.sentText}
        expression="calm"
        footerText={t.footerText}
        footerLink={t.footerLink}
      >
        <p className="text-[13.5px] leading-relaxed text-muted">{t.sentHint}</p>
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
        <Input
          label={authContents.fields.email.label}
          placeholder={authContents.fields.email.placeholder}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" disabled={busy} magnetic={false} className="mt-1 w-full">
          {busy ? t.submitting : t.submit}
        </Button>
      </form>
    </AuthCard>
  );
}
