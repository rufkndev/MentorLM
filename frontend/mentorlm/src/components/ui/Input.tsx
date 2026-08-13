/**
 * Поля ввода в фирменном стиле: Input (текст/почта) и PasswordInput.
 * Оформление — утопленный «колодец» .inset-well, тот же, что у поиска в
 * сайдбаре и переключателя режимов: поля лежат внутри стеклянной карточки, и
 * второй слой блюра там был бы лишним.
 */

"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Текст ошибки под полем; заодно подсвечивает рамку. */
  error?: string;
  /** Подсказка под полем (например требования к паролю). */
  hint?: string;
};

const fieldClasses =
  "inset-well h-11 w-full rounded-xl px-3.5 text-[15px] text-ink placeholder:text-muted " +
  "outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--brand-focus)] " +
  "disabled:opacity-50";

// Общая обвязка поля: подпись сверху, ошибка/подсказка снизу.
function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* 500 — интерфейсная подпись, а не читаемый текст (см. правило весов) */}
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint}>
      <input
        ref={ref}
        id={inputId}
        // Скринридер должен прочитать ошибку, а не только увидеть красную рамку.
        aria-invalid={error ? true : undefined}
        className={cn(fieldClasses, error && "ring-2 ring-red-400/70", className)}
        {...rest}
      />
    </Field>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  function PasswordInput({ label, error, hint, className, id, ...rest }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const [visible, setVisible] = useState(false);

    return (
      <Field label={label} htmlFor={inputId} error={error} hint={hint}>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? "text" : "password"}
            aria-invalid={error ? true : undefined}
            className={cn(
              fieldClasses,
              "pr-11",
              error && "ring-2 ring-red-400/70",
              className,
            )}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
            // tabIndex -1: кнопка не должна вставать между полем пароля и
            // кнопкой отправки при переходе по Tab.
            tabIndex={-1}
            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:text-ink"
          >
            {visible ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.7} />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.7} />
            )}
          </button>
        </div>
      </Field>
    );
  },
);
