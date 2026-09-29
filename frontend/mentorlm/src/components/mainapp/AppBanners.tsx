/**
 * Полоса-напоминание над содержимым режима: ровно одна за раз.
 *
 * Здесь три разных сообщения, и очередь между ними важнее каждого из них:
 * поставленные друг над другом, они съедают верх экрана и перестают читаться.
 * Порядок — от самого полезного человеку к самому нужному нам:
 *
 * 1. **Предложение суточного демо Plus** — пока его не брали. Если почта не
 *    подтверждена, оно же просит её подтвердить: так у подтверждения появляется
 *    цель, понятная человеку, а не только нам.
 * 2. **Срок идущего демо** — чтобы «сутки» не кончились неожиданно.
 * 3. **Напоминание про почту** — когда демо уже брали (или оно идёт и его срок
 *    скрыли), а адрес всё ещё не подтверждён.
 *
 * Почему полоса, а не модалка: человек пришёл задать вопрос, и окно поперёк
 * экрана в этот момент отодвигает его от продукта. Почему демо включается
 * кнопкой, а не само при регистрации: так оно не сгорает у тех, кто пришёл
 * посмотреть и вернулся через неделю.
 *
 * Отказы от двух трейловых полос помним в localStorage — это предложения, и
 * навязываться ими нельзя; постоянная точка входа остаётся в ЛК. Отказ от
 * напоминания про почту, наоборот, живёт только до перезагрузки (см. сам
 * VerifyEmailBanner) — оно обязано возвращаться.
 */

"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useResendVerification } from "@/components/auth/useResendVerification";
import { useSubscription } from "@/components/mainapp/SubscriptionProvider";
import { VerifyEmailBanner } from "@/components/mainapp/VerifyEmailBanner";
import { trialCopy } from "@/content/billing";
import { useApi } from "@/hooks/useApi";

const OFFER_DISMISSED = "mentorlm-trial-offer";
const ACTIVE_DISMISSED = "mentorlm-trial-active";

// Срок демо показываем С ВРЕМЕНЕМ: период считается в часах, и «29 сентября»
// без «в 18:40» не отвечает на единственный вопрос, который человек задаёт.
function formatUntil(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Отказ читаем после гидратации: на сервере localStorage нет, и обращение к
// нему в первом рендере разошлось бы с SSR-разметкой.
function useDismissed(key: string): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(key) === "1");
    } catch {
      // Приватный режим или запрет на хранилище — просто покажем полосу.
    }
  }, [key]);

  return [
    dismissed,
    () => {
      setDismissed(true);
      try {
        window.localStorage.setItem(key, "1");
      } catch {
        // Не смогли запомнить — не повод оставлять полосу на экране.
      }
    },
  ];
}

export function AppBanners() {
  const api = useApi();
  const { user } = useAuth();
  const { sub, isTrial, refresh } = useSubscription();
  const {
    state: verifyState,
    error: verifyError,
    resend,
  } = useResendVerification();

  const [offerHidden, hideOffer] = useDismissed(OFFER_DISMISSED);
  const [activeHidden, hideActive] = useDismissed(ACTIVE_DISMISSED);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      await api.post("/api/billing/trial/", {});
      // Тариф и лимиты перечитываем: от них зависит половина интерфейса —
      // «Обдумать», вложения, тиры модели, шкалы расхода.
      await refresh();
    } catch {
      setError(trialCopy.error);
    } finally {
      setStarting(false);
    }
  }

  // Пока тариф не загружен — молчим: иначе предложение мигало бы тому, у кого
  // демо уже идёт или кто вообще платит.
  if (!user || !sub) return null;

  // 1. Демо ещё не брали.
  if (sub.trial_available && !offerHidden) {
    if (!user.email_verified) {
      return (
        <Shell onDismiss={hideOffer}>
          <p className="min-w-0 flex-1 text-ink-soft">
            {verifyState === "sent"
              ? trialCopy.verifySent
              : (verifyError ?? trialCopy.verifyText)}
          </p>
          {verifyState !== "sent" && (
            <Action onClick={resend} busy={verifyState === "sending"}>
              {verifyState === "sending"
                ? trialCopy.verifySending
                : trialCopy.verifyAction}
            </Action>
          )}
        </Shell>
      );
    }

    return (
      <Shell onDismiss={hideOffer}>
        <p className="min-w-0 flex-1 text-ink-soft">
          <span className="font-medium text-ink">{trialCopy.offerTitle}</span>{" "}
          {error ?? trialCopy.offerText}
        </p>
        <Action onClick={start} busy={starting}>
          {starting ? trialCopy.offerStarting : trialCopy.offerAction}
        </Action>
      </Shell>
    );
  }

  // 2. Демо идёт — напоминаем срок, пока человек его не скрыл.
  if (isTrial && !activeHidden) {
    return (
      <Shell onDismiss={hideActive}>
        <p className="min-w-0 flex-1 text-ink-soft">
          <span className="font-medium text-ink">{trialCopy.activeTitle}</span>{" "}
          {trialCopy.activeUntil(formatUntil(sub.trial_ends_at))}.{" "}
          {trialCopy.activeNote}
        </p>
      </Shell>
    );
  }

  // 3. Про демо сказать нечего — остаётся напоминание про почту (оно само
  //    решает, показываться ли, и само знает, что не должно быть навязчивым).
  return <VerifyEmailBanner />;
}

// Оболочка полосы — та же, что у напоминания о почте: справа сверху висит
// fixed-меню аккаунта, поэтому крестику нужно оставить место (pr-16).
function Shell({
  children,
  onDismiss,
}: {
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div className="pl-3 pr-16 pt-3">
      <div className="glass-chip flex items-center gap-3 rounded-2xl px-4 py-2.5 text-[13.5px]">
        <Sparkles
          className="h-4 w-4 shrink-0 text-[var(--brand-primary)]"
          strokeWidth={1.8}
          aria-hidden
        />
        {children}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={trialCopy.dismiss}
          title={trialCopy.dismiss}
          className="shrink-0 text-muted transition-colors hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

function Action({
  children,
  onClick,
  busy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="shrink-0 font-medium text-[var(--brand-primary)] underline-offset-4 hover:underline disabled:opacity-60"
    >
      {children}
    </button>
  );
}
