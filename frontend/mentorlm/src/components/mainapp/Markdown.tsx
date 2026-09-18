/**
 * Рендер Markdown-ответа ИИ в HTML (списки, заголовки, таблицы, код и т.д.).
 * Стили заданы в globals.css по скоупу `.md` через дизайн-токены — работают и в
 * тёмной теме. Используется в ChatMessage для ответов ассистента.
 *
 * ⚠️ ЗДЕСЬ РЕНДЕРИТСЯ НЕДОВЕРЕННЫЙ ТЕКСТ. Это вывод модели, а в режиме
 * «Исследовать» — ещё и пересказ найденных в интернете страниц. Поэтому:
 *
 *  • **Никогда не подключать `rehype-raw`** (и любой другой плагин, включающий
 *    сырой HTML). Без него react-markdown выбрасывает HTML-узлы, и `<img
 *    src=x onerror=…>` в ответе модели остаётся безобидным текстом. Подключение
 *    `rehype-raw` ради «поддержать <kbd>» превратит это в хранимую XSS — за
 *    одну строку в импортах. Если сырой HTML однажды понадобится, он идёт
 *    ТОЛЬКО в паре с `rehype-sanitize`.
 *  • `urlTransform` задан явно. У react-markdown есть свой разумный дефолт, но
 *    от дефолта защита не должна зависеть: он не виден в коде и меняется с
 *    мажорной версией библиотеки.
 */

"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Схемы, которые разрешено ставить в href/src. Всё прочее — включая
// `javascript:` и `data:` — превращается в пустую строку.
const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

function safeUrl(url: string): string {
  // Относительные адреса (./ , #anchor) разбираются с базой и остаются как есть.
  try {
    const parsed = new URL(url, "https://mentorlm.local/");
    return SAFE_PROTOCOLS.includes(parsed.protocol) ? url : "";
  } catch {
    return "";
  }
}

// Внутренняя реализация рендера Markdown.
function MarkdownImpl({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        components={{
          // Внешние ссылки открываем в новой вкладке безопасно. target/rel
          // идут ПОСЛЕ разворота props — так их нельзя перебить из разметки.
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// memo: при стриминге контент часто меняется — не перерисовываем дерево,
// пока строка не изменилась.
export const Markdown = memo(MarkdownImpl);
