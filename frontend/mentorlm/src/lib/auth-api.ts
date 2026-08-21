/**
 * Публичные эндпоинты входа, которым не нужна сессия: сброс пароля и
 * подтверждение почты по токену из письма.
 *
 * Отдельно от `useApi()` намеренно — тот хук вешает на каждый запрос заголовок
 * Authorization и умеет обновлять токен на 401. Здесь ни того, ни другого не
 * нужно и быть не может: человек приходит по ссылке из письма в браузер, где
 * он не залогинен, а доказательством служит сам одноразовый токен.
 *
 * Ошибки бросаем тем же классом AuthError, что и формы входа, — страницам
 * достаточно показать `err.message`, который бэкенд уже написал по-русски.
 */

import { AuthError } from "@/components/auth/AuthProvider";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

// Один POST без сессии: тело — JSON, ответ — 204/202 без содержимого.
async function post(path: string, body: Record<string, unknown>): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError("Нет связи с сервером. Проверьте интернет.", "offline");
  }

  if (res.ok) return;

  try {
    const data = (await res.json()) as { code?: string; message?: string };
    if (data?.message) throw new AuthError(data.message, data.code);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    // тело не JSON — ниже общий текст
  }
  throw new AuthError("Не удалось выполнить запрос. Попробуйте ещё раз.");
}

/**
 * Запросить письмо со ссылкой на смену пароля.
 * Успешен всегда, даже если такой почты у нас нет: бэкенд намеренно не
 * показывает, кто зарегистрирован, — и страница не должна делать это за него.
 */
export const requestPasswordReset = (email: string) =>
  post("/api/auth/password-reset/", { email });

/** Задать новый пароль по токену из письма. Гасит все сессии пользователя. */
export const confirmPasswordReset = (token: string, password: string) =>
  post("/api/auth/password-reset/confirm/", { token, password });

/** Подтвердить адрес почты токеном из письма. */
export const confirmEmailVerification = (token: string) =>
  post("/api/auth/verify-email/", { token });
