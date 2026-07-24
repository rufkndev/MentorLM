/**
 * Лёгкое информационное уведомление об использовании cookie.
 * Не блокирует работу, показывается один раз: выбор запоминается в localStorage.
 * Монтируется после гидратации, чтобы не мигать при SSR. Подключается глобально
 * в корневом layout, поэтому виден и на лендинге, и в приложении.
 */

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

// Ключ localStorage с признаком того, что уведомление уже показано.
const STORAGE_KEY = "mentorlm-cookie-consent";

// Плашка-уведомление о cookie внизу экрана.
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  // После гидратации показываем плашку, если пользователь её ещё не закрывал.
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage может быть недоступен — просто не показываем.
    }
  }, []);

  // Запоминаем закрытие и убираем плашку.
  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Игнорируем ошибки хранилища.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div className="glass-strong flex w-full max-w-3xl flex-col items-start gap-4 rounded-2xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-ink-soft">
          Мы используем технически необходимые cookie для работы сервиса.
          Подробнее — в{" "}
          <Link
            href="/legal/privacy"
            className="font-medium text-ink underline underline-offset-2 hover:text-[var(--brand-primary)]"
          >
            Политике конфиденциальности
          </Link>
          .
        </p>
        <Button
          size="sm"
          onClick={dismiss}
          magnetic={false}
          className="shrink-0"
        >
          Понятно
        </Button>
      </div>
    </div>
  );
}
