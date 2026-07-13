"use client";

/*
 * Поведение контекстного меню строки чата: позиционирование fixed-портала у
 * кнопки и закрытие по клику вне / скроллу / ресайзу. Вынесено из разметки —
 * ChatRow остаётся презентационным.
 */

import { useEffect, useRef, useState } from "react";

const MENU_WIDTH = 176; // w-44
const MENU_HEIGHT = 132; // 3 пункта ≈ высота меню

export function useChatRowMenu() {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = coords !== null;

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Меню — fixed-портал у кнопки: не клиппится скроллом и не двигает чаты.
    let top = r.bottom + 4;
    if (top + MENU_HEIGHT > window.innerHeight) top = r.top - MENU_HEIGHT - 4;
    const left = Math.max(8, r.right - MENU_WIDTH);
    setCoords({ top, left });
  };

  const close = () => setCoords(null);
  const toggle = () => (open ? close() : openMenu());

  // Закрываем по клику вне меню/кнопки, при скролле и ресайзе.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return { coords, open, btnRef, menuRef, close, toggle };
}
