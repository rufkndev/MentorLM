"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Рендер Markdown-ответа ИИ. Разметка (списки, заголовки, таблицы, код,
 * **жирный** и т.д.) превращается в HTML; стили заданы в globals.css по скоупу
 * `.md` через design-токены, поэтому всё работает и в тёмной теме.
 *
 * memo: при стриминге контент часто меняется — мемоизируем по строке, чтобы не
 * перерисовывать дерево, пока текст не изменился.
 */
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

export const Markdown = memo(MarkdownImpl);
