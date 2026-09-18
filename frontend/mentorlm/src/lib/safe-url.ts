/**
 * Проверки адресов перед переходом.
 *
 * Любой адрес, который пришёл из query-параметра или из ответа API, — чужой
 * ввод, даже если выглядит своим. Браузер разбирает адреса не так буквально,
 * как строковые проверки, и почти все дыры здесь именно из этого расхождения.
 */

/**
 * Внутренний путь для редиректа после входа — или `fallback`.
 *
 * Проверки `next.startsWith("/")` НЕ достаточно, и это не теория:
 *   - `//evil.com` начинается со слэша, но браузер видит протокол-относительный
 *     адрес и уходит на чужой домен;
 *   - `/\evil.com` — то же самое: для http(s) браузер нормализует `\` в `/`.
 * Оба варианта превращают форму входа в открытый редирект, причём срабатывает
 * он сразу ПОСЛЕ ввода пароля — то есть в момент максимального доверия.
 */
export function safeInternalPath(
  next: string | null | undefined,
  fallback = "/chat",
): string {
  if (!next || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/**
 * Внешний адрес, если он https и ведёт на один из разрешённых доменов.
 *
 * Нужна там, где по адресу из ответа API уходит навигация или ссылка. React не
 * блокирует `javascript:` в href — он только предупреждает в консоли в dev, а
 * рендерит как есть; `window.location.assign("javascript:…")` в части браузеров
 * тоже исполняется. Пока адрес приходит от нашего же бэкенда, это защита от
 * ошибки в данных, а не от атаки, — но стоит она одну проверку.
 */
export function safeExternalUrl(
  raw: string | null | undefined,
  allowedHosts?: readonly string[],
): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  // Без списка доменов проверяем только схему. Так и надо там, где адрес
  // заполняет наш же администратор (ссылка на чек из «Мой налог»): угадывать
  // за ФНС её домены — верный способ однажды спрятать настоящий чек.
  if (!allowedHosts) return url.toString();
  const host = url.hostname.toLowerCase();
  const ok = allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
  return ok ? url.toString() : null;
}

/** Домены платёжного провайдера: на них уходит оформление подписки. */
export const YOOKASSA_HOSTS = ["yookassa.ru", "yoomoney.ru"] as const;
