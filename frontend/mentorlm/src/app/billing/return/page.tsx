/**
 * Страница возврата с платёжной формы ЮKassa (/billing/return?payment=<id>).
 *
 * Существует потому, что редирект с формы и уведомление вебхука — две гонки, и
 * человек обычно выигрывает: он уже здесь, а уведомление ещё в пути. Ждать
 * вебхук молча было бы худшим вариантом («я заплатил, а тариф старый»).
 * Поэтому страница опрашивает наш API, а тот на каждом запросе незавершённого
 * платежа сам переспрашивает статус у ЮKassa (billing/views.py). Вебхук при
 * этом остаётся главным механизмом — просто мы на него не закладываемся.
 *
 * Дальше человек уходит сам — кнопкой. Автоматический редирект по таймеру мы
 * не делаем: подтверждение оплаты человек должен успеть прочитать, а страница,
 * которая уезжает из-под курсора, читается как сбой.
 */

"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSubscription } from "@/components/mainapp/SubscriptionProvider";
import { Button } from "@/components/ui/Button";
import { ApiError, useApi } from "@/hooks/useApi";
import { returnContents as t } from "@/content/billing";

// Как часто спрашивать статус и сколько всего ждать. 1.5 с — заметно быстрее
// человеческого терпения, 30 с — потолок, после которого дальнейшее ожидание
// ничего не даст: платёж досинхронизирует планировщик.
const POLL_MS = 1_500;
const TIMEOUT_MS = 30_000;

type Phase = "pending" | "success" | "canceled" | "timeout" | "notFound";

// Что бэкенд рассказал о привязке платёжного средства по этому платежу.
type BindingResult = {
  requested: boolean;
  enabled: boolean;
  methodLabel: string;
};

// Ответ /api/billing/payments/<id>/ в той части, которая нужна этой странице.
type PaymentStatus = {
  status: string;
  plan_label: string;
  auto_renew_requested: boolean;
  auto_renew_enabled: boolean;
  method_label: string;
  /** Причина отказа словами; пусто, если код от ЮKassa нам незнаком. */
  cancellation_hint: string;
};

export default function BillingReturnPage() {
  return (
    <Suspense fallback={null}>
      <ReturnInner />
    </Suspense>
  );
}

function ReturnInner() {
  const params = useSearchParams();
  const paymentId = params.get("payment");
  const api = useApi();
  const router = useRouter();
  const { status } = useAuth();
  const { refresh } = useSubscription();

  const [phase, setPhase] = useState<Phase>("pending");
  const [planLabel, setPlanLabel] = useState("");
  // Почему банк отказал и просили ли при этом автопродление. Второе важно:
  // с автопродлением мы открываем форму ввода карты, и человек, у которого
  // именно эта карта не проходит, иначе не догадается, что без галочки ему
  // доступны СБП и другие способы.
  const [cancelHint, setCancelHint] = useState("");
  const [wantedAutoRenew, setWantedAutoRenew] = useState(false);
  // Итог попытки привязки. Заполняется только при успешной оплате и нужен
  // ровно для одного: сказать человеку, что заказанного им автопродления не
  // будет, — пока он ещё смотрит на экран, а не через месяц.
  const [binding, setBinding] = useState<BindingResult | null>(null);

  // Держим в ref, чтобы эффект опроса не перезапускался из-за смены ссылок.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Без сессии платёж не запросить: он приватный. Человек мог вернуться с
  // формы в другом браузере или спустя время — уводим на вход и возвращаем сюда.
  useEffect(() => {
    if (status === "anon") {
      const next = `/billing/return${paymentId ? `?payment=${paymentId}` : ""}`;
      router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
    }
  }, [status, paymentId, router]);

  useEffect(() => {
    if (!paymentId) {
      setPhase("notFound");
      return;
    }
    // Пока сессия восстанавливается, запрос ушёл бы без токена. Ждём —
    // «платёж не найден» из-за неготовой сессии было бы худшей из ошибок.
    // `status` обязан быть в зависимостях: человек приходит сюда редиректом с
    // формы ЮKassa, то есть загрузкой страницы с нуля, и на первом рендере
    // сессия всегда ещё "loading". Без него эффект не перезапускался бы после
    // восстановления сессии — опрос не стартовал вообще, и страница крутила бы
    // «проверяем оплату» бесконечно, не доходя даже до таймаута.
    if (status !== "authed") return;

    let stopped = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (stopped) return;
      try {
        const p = await api.get<PaymentStatus>(
          `/api/billing/payments/${paymentId}/`,
        );
        if (stopped) return;

        if (p.status === "succeeded") {
          setPlanLabel(p.plan_label);
          setBinding({
            requested: p.auto_renew_requested,
            enabled: p.auto_renew_enabled,
            methodLabel: p.method_label,
          });
          setPhase("success");
          // Тариф изменился — перечитываем подписку, иначе сайдбар и ЛК
          // показывали бы старый план до следующей загрузки страницы.
          await refreshRef.current();
          return;
        }
        if (p.status === "canceled") {
          setCancelHint(p.cancellation_hint);
          setWantedAutoRenew(p.auto_renew_requested);
          setPhase("canceled");
          return;
        }
      } catch (e) {
        if (stopped) return;
        // 404 окончателен: платёж чужой или его нет. Всё остальное (сеть,
        // 5xx, протухший токен) — временно, и сдаваться на этом нельзя:
        // деньги, возможно, уже списаны.
        if (e instanceof ApiError && e.status === 404) {
          setPhase("notFound");
          return;
        }
      }

      if (Date.now() - startedAt > TIMEOUT_MS) {
        setPhase("timeout");
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    };

    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [paymentId, api, status]);

  return (
    <section className="relative flex min-h-screen items-center justify-center px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[420px] w-[640px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(closest-side, var(--brand-ice) 0%, transparent 70%)",
          filter: "blur(48px)",
          opacity: 0.7,
        }}
      />

      <div className="glass-strong relative w-full max-w-md rounded-[var(--radius-lg)] p-8 text-center">
        {phase === "pending" && (
          <Status
            icon={
              <Loader2
                className="h-5 w-5 animate-spin"
                strokeWidth={1.9}
                aria-hidden
              />
            }
            title={t.pending.title}
            text={t.pending.text}
          />
        )}

        {phase === "success" && (
          <>
            <Status
              tone="success"
              icon={<Check className="h-5 w-5" strokeWidth={2.4} aria-hidden />}
              title={t.success.title}
              text={t.success.text(planLabel)}
            />

            {/* Автопродление просили, но привязка не удалась. Тариф при этом
                оплачен и работает — поэтому это дополнение к успеху, а не
                ошибка: пугать человека нечем, деньги на месте. */}
            {binding?.requested && !binding.enabled && (
              <div className="mt-5 rounded-2xl border border-[#e08a1e]/35 bg-[#e08a1e]/[0.08] p-4 text-left">
                <p className="flex items-start gap-2 text-[13.5px] font-medium text-ink">
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 flex-none text-[#c2761a]"
                    strokeWidth={1.9}
                    aria-hidden
                  />
                  {t.bindingFailed.title}
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                  {t.bindingFailed.text(binding.methodLabel)}
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                  {t.bindingFailed.notice}
                </p>
                <p className="mt-2 border-t border-[#e08a1e]/25 pt-2 text-[12px] leading-relaxed text-muted">
                  {t.bindingFailed.hint}
                </p>
              </div>
            )}

            <Button href="/chat" magnetic={false} className="mt-6 w-full">
              {t.success.action}
            </Button>
          </>
        )}

        {phase === "canceled" && (
          <>
            <Status
              tone="warn"
              icon={<AlertCircle className="h-5 w-5" strokeWidth={1.9} aria-hidden />}
              title={t.canceled.title}
              // Причина от банка вместо общей фразы, когда она известна: с
              // «попробуйте ещё раз» человек повторяет ту же карту, хотя при
              // 3-D Secure или лимите банка повтор не поможет никогда.
              text={cancelHint || t.canceled.text}
            />

            {/* Выход из тупика для тех, кто оформлял автопродление: им мы
                открыли форму карты, и без этой подсказки другие способы
                оплаты остаются для них невидимыми. */}
            {wantedAutoRenew && (
              <p className="mt-4 rounded-2xl border border-line bg-surface/60 px-4 py-3 text-left text-[12.5px] leading-relaxed text-ink-soft">
                {t.canceled.withoutAutoRenew}
              </p>
            )}

            <Button href="/billing" magnetic={false} className="mt-6 w-full">
              {t.canceled.action}
            </Button>
          </>
        )}

        {phase === "timeout" && (
          <>
            <Status
              icon={<AlertCircle className="h-5 w-5" strokeWidth={1.9} aria-hidden />}
              title={t.timeout.title}
              text={t.timeout.text}
            />
            <Button href="/chat" magnetic={false} className="mt-6 w-full">
              {t.timeout.action}
            </Button>
          </>
        )}

        {phase === "notFound" && (
          <>
            <Status
              tone="warn"
              icon={<AlertCircle className="h-5 w-5" strokeWidth={1.9} aria-hidden />}
              title={t.notFound.title}
              text={t.notFound.text}
            />
            <Button href="/billing" magnetic={false} className="mt-6 w-full">
              {t.notFound.action}
            </Button>
          </>
        )}

        <Link
          href="/billing"
          className="mt-5 inline-block text-[13px] text-muted transition-colors hover:text-ink"
        >
          {t.allPlans}
        </Link>
      </div>
    </section>
  );
}

// Иконка + заголовок + пояснение. Цвет несёт смысл, но не единственный:
// текст объясняет состояние сам по себе.
function Status({
  icon,
  title,
  text,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  tone?: "neutral" | "success" | "warn";
}) {
  const toneClass =
    tone === "success"
      ? "bg-[#1a8a4a]/12 text-[#1a8a4a]"
      : tone === "warn"
        ? "bg-[#e08a1e]/12 text-[#c2761a]"
        : "bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]";

  return (
    <div role="status" aria-live="polite">
      <span
        className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${toneClass}`}
      >
        {icon}
      </span>
      <h1 className="text-display mt-4 text-[22px] font-semibold text-ink">
        {title}
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{text}</p>
    </div>
  );
}
