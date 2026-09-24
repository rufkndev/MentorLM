/**
 * Сохранение файла, пришедшего с API, на диск пользователя.
 *
 * Простым `<a href>` обойтись нельзя: выгрузка идёт под access-токеном из
 * памяти (AuthProvider), а браузер к такой ссылке заголовок Authorization не
 * приложит. Поэтому файл забирается запросом и отдаётся через objectURL.
 */

/** Отдать blob пользователю как файл. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // Якорь должен быть в документе: Firefox игнорирует click() у открепленного.
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Освобождаем не сразу: в части браузеров загрузка к моменту возврата из
  // click() ещё не началась, и ранний revoke её обрывает. Но и не «никогда» —
  // иначе objectURL держит файл в памяти до закрытия вкладки.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Имя файла из заголовка Content-Disposition.
 *
 * Сервер шлёт два варианта: ASCII-заглушку в `filename=` и настоящее имя с
 * кириллицей в `filename*` (RFC 5987). Предпочитаем второй.
 *
 * ⚠️ В дев-режиме заголовок может не дойти: это кросс-доменный запрос, и без
 * `CORS_EXPOSE_HEADERS` браузер прячет его от JS (см. settings/dev.py). Тогда
 * возвращаем null, и вызывающий берёт запасное имя.
 */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // Битое процентное кодирование — падаем на ASCII-вариант ниже.
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? null;
}
