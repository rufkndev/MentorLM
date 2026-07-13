/**
 * Рендер Markdown-ответа ИИ в HTML (списки, заголовки, таблицы, код и т.д.).
 * Стили заданы в globals.css по скоупу `.md` через дизайн-токены — работают и в
 * тёмной теме. Используется в ChatMessage для ответов ассистента.
 */

"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Внутренняя реализация рендера Markdown.
function MarkdownImpl({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Внешние ссылки открываем в новой вкладке безопасно.
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
