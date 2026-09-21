"use client";

/**
 * Есть ли соединение с сетью (по данным браузера).
 * Нужно, чтобы честно сказать «нет связи» вместо непонятной ошибки отправки.
 */

import { useEffect, useState } from "react";

export function useOnline(): boolean {
  // До монтирования и на сервере считаем, что связь есть: иначе при первом
  // рендере мигала бы плашка «нет сети».
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
