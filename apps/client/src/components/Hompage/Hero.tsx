'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Terminal, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../../hooks/useAuth';

export default function Hero() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative overflow-hidden pt-16 pb-20 lg:pt-28 lg:pb-36 border-b border-brand-border" id="hero">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10" id="hero-container">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:items-stretch">
          
          {/* Left Column - High-End Typographical Engine & Interactive Prompt Line */}
          <div className="lg:col-span-6 flex flex-col justify-between space-y-8 text-left" id="hero-heading-block">
            <div className="space-y-6">
              
              <h1 className="font-display font-medium leading-[1.04] tracking-tight text-text-primary text-4xl sm:text-5xl lg:text-6xl" id="hero-headline">
                Headless content. <br />
                <span className="font-normal text-brand-secondary">Weaved beautifully.</span>
              </h1>

              <p className="text-sm sm:text-base text-text-secondary leading-relaxed max-w-lg font-light" id="hero-subheadline">
                The AI-native headless CMS. Define your own content model, draft with a built-in AI co-writer, and publish to a clean REST delivery API for any framework.
              </p>
            </div>

            {/* CTA BUTTONS AND SEED ACTIONS */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-4" id="hero-cta-actions">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider py-4 px-6 rounded-lg neo-shadow transition-all cursor-pointer"
              >
                <span>{isAuthenticated ? 'Go to Dashboard' : 'Launch Workspace'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="#sandbox"
                className="inline-flex items-center justify-center gap-2 bg-brand-surface border border-brand-border-button hover:border-text-secondary/60 text-text-secondary font-mono font-bold text-sm uppercase tracking-wider py-4 px-6 rounded-lg transition-all cursor-pointer"
              >
                <span>Try Sandbox</span>
                <Terminal className="w-4 h-4" />
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-sm font-mono text-text-muted" id="hero-badges">
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-brand-accent stroke-[3.5]" /> AI TEXT GENERATION</div>
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-brand-accent stroke-[3.5]" /> REST DELIVERY API</div>
            </div>
          </div>

          {/* Right Column - Frameless Typographic Spec sheet */}
          <div className="lg:col-span-6 flex flex-col justify-center relative lg:min-h-[440px]" id="hero-visual-block">
            {/* Clean, open-air SVG composition showcasing fluid connectivity of content nodes */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.25]">
              <svg className="w-full h-full" viewBox="0 0 400 400" fill="none">
                <motion.path 
                  d="M 40 120 Q 200 220 360 120" 
                  stroke="var(--brand-accent)" 
                  strokeWidth="1.5" 
                  strokeDasharray="6 4"
                  animate={{ strokeDashoffset: [0, -30] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                />
                <motion.path 
                  d="M 360 120 Q 200 270 40 320" 
                  stroke="var(--brand-accent)" 
                  strokeWidth="1"
                  animate={{ strokeDashoffset: [0, 30] }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                />
                <circle cx="40" cy="120" r="4" fill="var(--brand-accent)" />
                <circle cx="360" cy="120" r="4" fill="var(--brand-accent)" />
                <circle cx="40" cy="320" r="4" fill="var(--brand-accent)" />
              </svg>
            </div>

            <div className="space-y-10 pl-0 lg:pl-10 relative z-10 text-left">
              {/* Item 01 */}
              <div className="border-b border-brand-border pb-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm font-bold text-brand-accent tracking-widest">CONTENT MODEL</span>
                  <span className="h-[1px] bg-brand-border flex-grow" />
                </div>
                <div className="text-sm font-light text-text-secondary leading-relaxed">
                  Define content types with a visual field builder — text, rich text, media, and references with unique and multiple constraints. Every entry is validated against your schema.
                </div>
              </div>

              {/* Item 02 */}
              <div className="border-b border-brand-border pb-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm font-bold text-brand-accent tracking-widest">AI CO-WRITER</span>
                  <span className="h-[1px] bg-brand-border flex-grow" />
                </div>
                <h2 className="font-display font-medium text-text-primary text-2xl tracking-tight leading-tight mb-2">
                  Drafting that respects your voice.
                </h2>
                <div className="flex flex-wrap gap-2 sm:gap-4 text-sm font-mono text-text-muted">
                  <span>GENERATE · REFINE · COMPOSE</span>
                  <span>PER-PROJECT BRAND VOICE</span>
                </div>
              </div>

              {/* Item 03 */}
              <div className="pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm font-bold text-brand-accent tracking-widest">PUBLISH &amp; DELIVER</span>
                  <span className="h-[1px] bg-brand-border flex-grow" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-mono font-bold text-text-primary bg-brand-surface-soft border border-brand-border px-3 py-1 rounded">
                    STATUS: PUBLISHED
                  </span>
                  <span className="text-sm font-mono font-bold text-text-primary bg-brand-surface-soft border border-brand-border px-3 py-1 rounded">
                    CACHE: S-MAXAGE=60
                  </span>
                  <span className="text-sm font-mono font-bold text-brand-accent bg-brand-accent/5 border border-brand-accent/20 px-3 py-1 rounded">
                    PURGE: ON PUBLISH
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
