import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { mockPosts, type BlogBlock } from '../../../lib/blogData';
import { Calendar, Clock, ArrowLeft, ArrowRight } from 'lucide-react';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// All posts are known at build time — unknown slugs 404 instead of rendering.
export const dynamicParams = false;

export function generateStaticParams() {
  return mockPosts.map((p) => ({ slug: p.slug }));
}

/** Render the editorial block model with the site's prose styling. */
function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case 'p':
      return <p>{block.text}</p>;
    case 'h3':
      return <h3 className="font-display font-medium text-lg text-white pt-4">{block.text}</h3>;
    case 'quote':
      return (
        <blockquote className="border-l-4 border-brand-accent bg-[#120e2e]/80 p-5 italic rounded-r-lg font-medium text-white not-italic my-6">
          &ldquo;{block.text}&rdquo;
        </blockquote>
      );
    case 'list':
      return (
        <ul className="list-disc pl-6 space-y-4">
          {block.items.map((item, i) => (
            <li key={i}>
              {item.lead && <strong>{item.lead}</strong>} {item.text}
            </li>
          ))}
        </ul>
      );
    case 'code':
      return (
        <pre className="bg-[#060417] border border-brand-border/60 rounded-lg p-4 overflow-x-auto font-mono text-sm text-text-secondary">
          {block.text}
        </pre>
      );
  }
}

export default async function BlogPostReader({ params }: PageProps) {
  const { slug } = await params;
  const post = mockPosts.find((p) => p.slug === slug);
  if (!post) notFound();
  const relativePosts = mockPosts.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg text-text-primary space-grid relative" id="wriven-blog-reader">
      <Header />

      <main className="flex-grow py-12 sm:py-16 relative z-10">

        <div className="mx-auto max-w-4xl px-4 sm:px-6 relative z-10">

          {/* Back button link */}
          <div className="mb-8" id="blog-back-btn">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm font-mono font-bold text-text-secondary uppercase tracking-wider hover:text-brand-accent transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-brand-accent" />
              Back to all blog posts
            </Link>
          </div>

          <article className="space-y-8 bg-brand-surface/60 border border-brand-border rounded-xl p-6 sm:p-10 shadow-2xl backdrop-blur-md" id="post-main-container">
            {/* Header / Meta */}
            <div className="space-y-4 text-left border-b border-brand-border pb-6" id="post-meta-heading">
              <span className="inline-block bg-brand-secondary/10 border border-brand-secondary/30 text-brand-secondary text-sm font-semibold tracking-wider px-3 py-1 rounded-full">
                {post.category}
              </span>

              <h1 className="font-display font-medium leading-tight tracking-tight text-white text-3xl sm:text-4xl lg:text-5xl" id="post-reader-headline">
                {post.title}
              </h1>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-3">
                  <Image
                    src={post.authorImage}
                    alt={post.authorName}
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full border border-brand-border"
                  />
                  <div>
                    <span className="block text-sm font-bold text-white">{post.authorName}</span>
                    <span className="block text-sm font-mono text-text-muted">Software Engineer</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm font-mono text-text-muted">
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {post.date}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {post.readingTime}</span>
                </div>
              </div>
            </div>

            {/* Feature Banner Image */}
            <div className="aspect-[16/9] relative overflow-hidden bg-[#060417] rounded-xl border border-brand-border/60" id="post-cover-image-container">
              <Image
                src={post.coverImage}
                alt={post.title}
                fill
                sizes="(min-width: 896px) 832px, 100vw"
                className="object-cover w-full h-full opacity-80"
              />
            </div>

            {/* Content Body */}
            <div className="prose prose-invert max-w-none text-text-secondary leading-relaxed space-y-6 text-sm sm:text-base border-b border-brand-border pb-8 font-light" id="post-body-text">
              {post.body.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </div>
          </article>

          {/* Related Articles block */}
          <div className="mt-16 space-y-6" id="relative-articles">
            <h3 className="font-display font-medium text-xl text-white">Related Articles</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="relative-grid">
              {relativePosts.map((rel) => (
                <div key={rel.slug} className="bg-brand-surface/40 border border-brand-border/80 rounded-xl p-6 shadow-xl flex flex-col justify-between hover:border-brand-accent/40 transition-all">
                  <div className="space-y-2">
                    <span className="text-sm font-mono font-semibold text-brand-accent uppercase tracking-wider">{rel.category}</span>
                    <h4 className="font-display font-medium text-base text-white line-clamp-2 hover:text-brand-accent transition-colors">
                      <Link href={`/blog/${rel.slug}`}>{rel.title}</Link>
                    </h4>
                    <p className="text-sm text-text-secondary font-light line-clamp-2">{rel.excerpt}</p>
                  </div>

                  <Link
                    href={`/blog/${rel.slug}`}
                    className="inline-flex items-center gap-1 text-sm font-mono uppercase tracking-wider font-bold text-white hover:text-brand-accent pt-5"
                  >
                    Read article
                    <ArrowRight className="w-3.5 h-3.5 text-brand-accent" />
                  </Link>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
