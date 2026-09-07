import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { mockPosts } from '@/lib/blogData';

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = mockPosts.find((p) => p.slug === slug);
  if (!post) notFound();

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt,
      publishedTime: post.date,
    },
  };
}

export default function BlogPostLayout({ children }: Props) {
  return children;
}
