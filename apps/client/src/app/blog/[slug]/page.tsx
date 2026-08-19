'use client';

import React, { use } from 'react';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { mockPosts } from '../../../lib/blogData';
import { Calendar, Clock, ArrowLeft, ArrowRight, Share2, MessageSquare, Send, Globe } from 'lucide-react';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function BlogPostReader({ params }: PageProps) {
  // Unwrapping the dynamic next.js params promise
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

  const post = mockPosts.find((p) => p.slug === slug) || mockPosts[0];
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.authorImage}
                    alt={post.authorName}
                    referrerPolicy="no-referrer"
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.coverImage}
                alt={post.title}
                referrerPolicy="no-referrer"
                className="object-cover w-full h-full opacity-80"
              />
            </div>

            {/* Content Body */}
            <div className="prose prose-invert max-w-none text-text-secondary leading-relaxed space-y-6 text-sm sm:text-base border-b border-brand-border pb-8 font-light" id="post-body-text">
              <p className="font-medium text-white text-base sm:text-lg">
                As content systems evolve, the pressure on developers and authors increases. Standard content workflows demand absolute synchronization across codebases, media catalogs, and LLM workspaces. In this post, we analyze how AI-native systems redefine content orchestration.
              </p>
              
              <p>
                A headless system architecture separated the developer’s React bundle from the backend’s SQL database. It solved delivery speed, but created a friction-filled workspace experience for editors. Authors find themselves drafting titles inside ChatGPT, translating strings in DeepL, creating illustrations in Midjourney, copy-pasting codeblocks into simple textareas, and hoping headers do not break.
              </p>

              <blockquote className="border-l-4 border-brand-accent bg-[#120e2e]/80 p-5 italic rounded-r-lg font-medium text-white not-italic my-6">
                &ldquo;By placing generative models directly into the field input controls of structured content matrices, Wriven weaves human ideas and machine translations on one collaborative dashboard.&rdquo;
              </blockquote>

              <h3 className="font-display font-medium text-lg text-white pt-4">Expanding primitive types into smart assets</h3>
              <p>
                In standard headless CMS engines like Strapi or Sanity, a field type is declared as <code className="bg-violet-950/40 text-violet-300 border border-violet-900/30 px-1.5 py-0.5 rounded font-mono text-sm">Short_Text</code>, <code className="bg-violet-950/40 text-violet-300 border border-violet-900/30 px-1.5 py-0.5 rounded font-mono text-sm">Rich_Markdown</code>, or <code className="bg-violet-950/40 text-violet-300 border border-violet-900/30 px-1.5 py-0.5 rounded font-mono text-sm">Media_Library</code>. Wriven takes this baseline configuration and extends it with server-side AI handlers.
              </p>

              <ul className="list-disc pl-6 space-y-4">
                <li><strong>Context-Aware fields:</strong> The in-editor prompt sees the overall schema layout. If a user generates a blog description, the AI contextually reads the Title to maintain semantic alignment.</li>
                <li><strong>Pre-Populated SEO metatags:</strong> Click to auto-generate keywords, localized translations, and click-worthy titles for search ranking.</li>
                <li><strong>Native Asset Generation:</strong> Build abstract cover imagery, photorealistic thumbnails, and high-contrast visuals without invoking external AI interfaces.</li>
              </ul>

              <h3 className="font-display font-medium text-lg text-white pt-4">Summary</h3>
              <p>
                The future of the content pipeline is deeply integrated, quiet, and fast. By building server-side generative helpers natively into high-speed content delivery structures, authors get maximum leverage, and developers get uncompromised, clean JSON delivered at the edge.
              </p>
            </div>

            {/* Social Share / Interaction Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2" id="post-share-interactions">
              <div className="flex gap-2">
                <button className="inline-flex items-center gap-1.5 bg-brand-surface-soft hover:bg-brand-border text-sm font-mono font-semibold text-text-secondary px-3.5 py-2.5 rounded-lg transition-colors cursor-pointer">
                  <MessageSquare className="w-3.5 h-3.5 text-brand-accent" />
                  Comment
                </button>
                <button className="inline-flex items-center gap-1.5 bg-brand-surface-soft hover:bg-brand-border text-sm font-mono font-semibold text-text-secondary px-3.5 py-2.5 rounded-lg transition-colors cursor-pointer">
                  <Share2 className="w-3.5 h-3.5 text-brand-accent" />
                  Share post
                </button>
              </div>

              <div className="flex gap-2">
                <a href="#" className="p-2.5 rounded-lg bg-brand-surface-soft hover:bg-brand-border text-text-secondary transition-colors">
                  <Send className="w-4 h-4" />
                </a>
                <a href="#" className="p-2.5 rounded-lg bg-brand-surface-soft hover:bg-brand-border text-text-secondary transition-colors">
                  <Globe className="w-4 h-4" />
                </a>
              </div>
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
