'use client';

import React from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { Calendar, Clock, ArrowRight, User } from 'lucide-react';

export default function Blog() {
  const featuredPost = {
    title: "The Architecture of Headless Content Injections",
    slug: "headless-content-injections",
    category: "Architecture",
    excerpt: "Dismantling the constraints of monolithic layout definitions. Learn how we feed raw content schemas directly into lightweight React layers at low latency, and why inline prompt engineering is changing the speed of digital media production.",
    date: "June 08, 2026",
    readingTime: "6 min read",
    coverImage: "https://picsum.photos/seed/injection/800/500",
    authorName: "Marcus Weave",
    authorImage: "https://picsum.photos/seed/marcus/100/100"
  };

  const remainingPosts = [
    {
      title: "Designing Minimalist Interfaces for Information Density",
      slug: "minimalist-interfaces",
      category: "Design",
      excerpt: "Why high-contrast editorial layouts outperform cluttered purple grids. Exploring Swiss print aesthetics, offset shadows, and calm color rules.",
      date: "May 24, 2026",
      readingTime: "4 min read",
      coverImage: "https://picsum.photos/seed/density/600/400",
      authorName: "Elena Rostova"
    },
    {
      title: "Optimizing JSON Feed Pipelines Over Vercel Edge Serverless",
      slug: "optimizing-json-pipelines",
      category: "Engineering",
      excerpt: "Deep dives into stateful API caches, query optimizations, and token security boundaries. How to deliver markdown content streams globally under 12ms.",
      date: "May 11, 2026",
      readingTime: "8 min read",
      coverImage: "https://picsum.photos/seed/pipeline/600/400",
      authorName: "Sophia Wright"
    },
    {
      title: "The Copilot Manifest: Bridging AI Drafts and Editorial Craft",
      slug: "copilot-manifest",
      category: "Workflows",
      excerpt: "An investigation on how content producers collaborate with inline algorithms without sacrificing brand voice integrity or premium editorial cadence.",
      date: "April 29, 2026",
      readingTime: "5 min read",
      coverImage: "https://picsum.photos/seed/copilot/600/400",
      authorName: "Marcus Weave"
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg text-text-primary editorial-grid relative paper-grain" id="wriven-blog-page">
      <Header />

      <main className="flex-grow py-16 lg:py-24 relative z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          
          {/* Header Info */}
          <div className="max-w-3xl mx-auto text-center space-y-4 mb-16" id="blog-header-box">
            <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase animate-fade-in">
              Wriven Journal
            </span>
            <h1 className="font-display font-medium tracking-tight text-text-primary text-4xl sm:text-5xl" id="blog-title">
              Weaving thoughts and code
            </h1>
            <p className="text-text-secondary text-sm sm:text-base leading-relaxed font-light">
              Explore our technical logs on headless API optimization, server-side dynamic generation, and next-generation content pipeline designs.
            </p>
          </div>

          {/* Featured Post Block - Designed like elegant broadsheet news lead */}
          {featuredPost && (
            <div className="mb-20 bg-brand-surface border border-brand-border-button rounded-xl overflow-hidden shadow-2xl relative neo-shadow-lg" id="featured-blog-block">
              <div className="absolute top-0 right-0 p-4 z-20">
                <span className="bg-brand-secondary border border-brand-border-button text-white text-sm font-semibold tracking-wider px-3 py-1.5 rounded-md uppercase">
                  Featured — {featuredPost.category}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
                <div className="lg:col-span-7 aspect-[16/10] relative bg-brand-surface-soft overflow-hidden border-r border-brand-border-button">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={featuredPost.coverImage}
                    alt={featuredPost.title}
                    referrerPolicy="no-referrer"
                    className="object-cover w-full h-full hover:scale-[1.01] transition-transform duration-350"
                  />
                </div>

                <div className="lg:col-span-5 p-8 sm:p-10 flex flex-col justify-between text-left" id="featured-post-text">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 text-sm font-mono text-brand-accent font-bold uppercase">
                      <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {featuredPost.date}</span>
                      <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {featuredPost.readingTime}</span>
                    </div>

                    <h2 className="font-display font-bold text-2xl sm:text-3xl text-text-primary leading-tight hover:text-brand-accent transition-colors">
                      <Link href={`/blog/${featuredPost.slug}`}>{featuredPost.title}</Link>
                    </h2>

                    <p className="text-sm text-text-secondary leading-relaxed font-light">
                      {featuredPost.excerpt}
                    </p>
                  </div>

                  <div className="pt-6 border-t border-brand-border mt-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={featuredPost.authorImage}
                        alt={featuredPost.authorName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full border border-brand-border"
                      />
                      <div>
                        <span className="block text-sm font-bold text-text-primary">{featuredPost.authorName}</span>
                        <span className="block text-sm font-mono text-text-muted">Editor-in-Chief</span>
                      </div>
                    </div>

                    <Link
                      href={`/blog/${featuredPost.slug}`}
                      className="inline-flex items-center gap-1 text-sm font-mono font-bold text-text-primary uppercase tracking-wider hover:text-brand-accent transition-colors"
                      id="view-featured-action"
                    >
                      Read post
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Grid list of remaining posts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto text-left" id="blog-remaining-posts-grid">
            {remainingPosts.map((post) => (
              <div
                key={post.slug}
                className="flex flex-col bg-brand-surface border border-brand-border-button rounded-xl overflow-hidden group transition-all duration-300 neo-shadow hover:-translate-y-0.5"
                id={`blog-card-${post.slug}`}
              >
                <div className="aspect-[16/10] bg-[#FAF8F5] overflow-hidden relative border-b border-brand-border-button">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    referrerPolicy="no-referrer"
                    className="object-cover w-full h-full grayscale group-hover:grayscale-0 transition-transform duration-350"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="bg-brand-surface border border-brand-border-button text-brand-secondary text-sm font-semibold tracking-wider px-2.5 py-1 rounded">
                      {post.category}
                    </span>
                  </div>
                </div>

                <div className="p-6 space-y-4 flex-1 flex flex-col justify-between" id={`blog-card-content-${post.slug}`}>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3 text-sm font-mono text-text-muted">
                      <span>{post.date}</span>
                      <span>&bull;</span>
                      <span>{post.readingTime}</span>
                    </div>

                    <h3 className="font-display font-bold text-base text-text-primary group-hover:text-brand-accent transition-colors leading-snug">
                      <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                    </h3>

                    <p className="text-sm text-text-secondary leading-relaxed font-light min-h-[50px]">
                      {post.excerpt}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-brand-border mt-4 flex items-center justify-between text-sm font-semibold text-text-primary">
                    <span className="flex items-center gap-1.5 font-mono text-sm font-bold text-text-secondary">
                      <User className="w-3.5 h-3.5 text-brand-accent" />
                      {post.authorName}
                    </span>

                    <Link href={`/blog/${post.slug}`} className="inline-flex items-center gap-1 font-mono text-sm uppercase font-bold text-text-primary hover:text-brand-accent">
                      Read article <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
