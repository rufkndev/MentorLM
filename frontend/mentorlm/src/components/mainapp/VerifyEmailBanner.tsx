/**
 * Напоминание подтвердить почту — тонкая полоса над содержимым режима.
 *
 * Показывается, пока `email_verified` у профиля false, и умеет заказать письмо
 * заново. Намеренно не модальное и закрывается: неподтверждённая почта ничего
 * не ломает прямо сейчас, она аукнется только при «забыл пароль», — поэтому
 * напоминать нужно настойчиво, но не мешать работать.
 *
 * Скрытие живёт в состоянии компонента, то есть до перезагрузки страницы:
 * записывать отказ в localStorage не хочется — напоминание должно вернуться.
 */

"use client";

import { useState } from "react";
import { MailWarning, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useResendVerification } from "@/components/auth/useResendVerification";
import { authContents } from "@/lib/auth-contents";

const t = authContents.verifyBanner;

export function VerifyEmailBanner() {
  const { user } = useAuth();
  const { state, error, resend } = useResendVerification();
  const [hidden, setHidden] = useState(false);

  if (!user || user.email_verified || hidden) return null;

  return (
    // Справа сверху висит fixed-меню аккаунта — оставляем ему место, иначе
    // крестик «скрыть» окажется прямо под ним.
    <div className="pl-3 pr-16 pt-3">
      <div className="glass-chip flex items-center gap-3 rounded-2xl px-4 py-2.5 text-[13.5px]">
        <MailWarning
          className="h-4 w-4 shrink-0 text-[var(--brand-primary)]"
          strokeWidth={1.8}
          aria-hidden
        />

        <p className="min-w-0 flex-1 text-ink-soft">
          {state === "sent" ? t.sent : (error ?? t.text)}
        </p>

        {state !== "sent" && (
          <button
            type="button"
            onClick={resend}
            disabled={state === "sending"}
            className="shrink-0 font-medium text-[var(--brand-primary)] underline-offset-4 hover:underline disabled:opacity-60"
          >
            {state === "sending" ? t.sending : t.action}
          </button>
        )}

        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label={t.dismiss}
          title={t.dismiss}
          className="shrink-0 text-muted transition-colors hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
