/**
 * Страница регистрации (/sign-up). Почта, пароль с повтором и обязательное
 * согласие на обработку персональных данных (152-ФЗ) — без отмеченного
 * чекбокса бэкенд регистрацию не примет, и форма его не отправит.
 * После регистрации уводит в чат.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthError, useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input, PasswordInput } from "@/components/ui/Input";
import { authContents } from "@/lib/auth-contents";

const t = authContents.signUp;
const consent = authContents.consent;

export default function SignUpPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setRepeatError(null);

    // Совпадение паролей проверяем здесь: бэкенд про повтор не знает — это
    // защита от опечатки, а не правило безопасности.
    if (password !== repeat) {
      setRepeatError(authContents.errors.passwordMismatch);
      return;
    }
    if (!agreed) {
      setError(authContents.errors.consentRequired);
      return;
    }

    setBusy(true);
    try {
      await register(email, password);
      router.replace("/chat");
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

        {/* Согласие на обработку ПДн — обязательное и осознанное действие */}
        <label className="mt-1 flex cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-ink-soft">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              if (error) setError(null);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
          />
          <span>
            {consent.before}
            <Link
              href={consent.terms.href}
              target="_blank"
              className="text-[var(--brand-primary)] underline-offset-4 hover:underline"
            >
              {consent.terms.label}
            </Link>
            {consent.middle}
            <Link
              href={consent.privacy.href}
              target="_blank"
              className="text-[var(--brand-primary)] underline-offset-4 hover:underline"
            >
              {consent.privacy.label}
            </Link>
          </span>
        </label>

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
