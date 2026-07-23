/**
 * Страница отдельной статьи блога (/blog/[slug]).
 * Находит статью по slug в blog-contents.ts и рисует её тело через BlogArticle.
 * Маршруты и метаданные генерируются из данных — отдельный файл на статью не нужен.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BlogArticle } from "@/components/landing/BlogArticle";
import { DocPage } from "@/components/landing/DocPage";
import { formatPostDate, getPostBySlug, posts } from "@/lib/blog-contents";

// Пропсы страницы: slug статьи из динамического сегмента.
type Props = { params: Promise<{ slug: string }> };

// Пререндерим статические маршруты под каждую статью.
export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

// SEO-метаданные конкретной статьи.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Статья не найдена" };
  return { title: post.title, description: post.excerpt };
}

// Контент страницы статьи.
export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <DocPage
      eyebrow={`${post.tag} · ${formatPostDate(post.date)} · ${post.readingMinutes} мин`}
      title={post.title}
      description={post.excerpt}
    >
      <BlogArticle content={post.content} />

      <hr />
      <p>
        <Link href="/blog">← Ко всем материалам</Link>
      </p>
    </DocPage>
  );
}
