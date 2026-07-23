/**
 * Рендерер тела статьи блога: превращает массив блоков (BlogBlock) в разметку.
 * Рассчитан на вставку внутрь `.doc-prose` (DocPage) — отдаёт блоки фрагментом,
 * чтобы типографика документа применялась к ним напрямую. Так статьи описываются
 * данными в blog-contents.ts, а не JSX. Новый тип блока = одна ветка в switch.
 */

import type { BlogBlock } from "@/lib/blog-contents";

// Рисует последовательность блоков статьи.
export function BlogArticle({ content }: { content: readonly BlogBlock[] }) {
  return (
    <>
      {content.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </>
  );
}

// Один блок статьи → соответствующий HTML-элемент.
function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "h2":
      return <h2>{block.text}</h2>;
    case "h3":
      return <h3>{block.text}</h3>;
    case "p":
      return <p>{block.text}</p>;
    case "ul":
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "quote":
      return <blockquote>{block.text}</blockquote>;
  }
}
