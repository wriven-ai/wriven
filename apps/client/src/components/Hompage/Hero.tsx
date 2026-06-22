'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Terminal, Check } from 'lucide-react';
import { motion } from 'motion/react';

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-20 lg:pt-28 lg:pb-36 border-b border-brand-border" id="hero">
      {/* Subtle Decorative grid markers in corners (Architectural layout aesthetic) */}
      <div className="absolute top-4 left-4 text-[9px] font-mono text-text-muted select-none pointer-events-none">[GRID_SYS // LAUNCH_MATRIX]</div>
      <div className="absolute top-4 right-4 text-[9px] font-mono text-text-muted select-none pointer-events-none">NODE_COORDS_40.3</div>
      
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
                The intellectual workspace for structured modern content. Craft beautiful layouts, compile pristine assets, inscribe copy with inline algorithms, and stream instant edge JSON globally.
              </p>
            </div>

            {/* CTA BUTTONS AND SEED ACTIONS */}
            <div className="flex flex-wrap items-center gap-4" id="hero-cta-actions">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-xs uppercase tracking-wider py-4 px-6 rounded-lg neo-shadow transition-all cursor-pointer"
              >
                <span>Launch Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="#sandbox"
                className="inline-flex items-center gap-2 bg-brand-surface border border-brand-border-button hover:border-text-secondary/60 text-text-secondary font-mono font-bold text-xs uppercase tracking-wider py-4 px-6 rounded-lg transition-all cursor-pointer"
              >
                <span>Try Sandbox</span>
                <Terminal className="w-4 h-4" />
              </Link>
            </div>

            <div className="flex items-center gap-6 pt-2 text-[10px] font-mono text-text-muted" id="hero-badges">
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-brand-accent stroke-[3.5]" /> EDGE METRIC PUSHES</div>
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-brand-accent stroke-[3.5]" /> ZERO DEPLOY RUNTIME</div>
            </div>
          </div>

          {/* Right Column - Frameless Typographic Spec sheet */}
          <div className="lg:col-span-6 flex flex-col justify-center relative min-h-[440px]" id="hero-visual-block">
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
                  <span className="font-mono text-[9px] font-bold text-brand-accent tracking-widest">[NODE_01 // STRUCTURAL_METADATA]</span>
                  <span className="h-[1px] bg-brand-border flex-grow" />
                </div>
                <div className="text-sm font-light text-text-secondary leading-relaxed">
                  Wriven translates raw editorial text into organized JSON attributes. Fully typed schema structures keep client layers, build servers, and compilers perfectly aligned.
                </div>
              </div>

              {/* Item 02 */}
              <div className="border-b border-brand-border pb-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-[9px] font-bold text-brand-accent tracking-widest">[NODE_02 // SYMMETRIC_GRID_METRIC]</span>
                  <span className="h-[1px] bg-brand-border flex-grow" />
                </div>
                <h2 className="font-display font-medium text-text-primary text-2xl tracking-tight leading-tight mb-2">
                  Where composition transcends automation.
                </h2>
                <div className="flex gap-4 text-[9px] font-mono text-text-muted">
                  <span>BASELINE: 8PX MODULAR</span>
                  <span>FONT: MANROPE HIGH-FIDELITY</span>
                </div>
              </div>

              {/* Item 03 */}
              <div className="pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-[9px] font-bold text-brand-accent tracking-widest">[NODE_03 // LIVE_EDGE_DEPLOYMENT]</span>
                  <span className="h-[1px] bg-brand-border flex-grow" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-text-primary bg-brand-surface-soft border border-brand-border px-3 py-1 rounded">
                    COMPILER: ONLINE
                  </span>
                  <span className="text-[10px] font-mono font-bold text-text-primary bg-brand-surface-soft border border-brand-border px-3 py-1 rounded">
                    LATENCY: 12ms
                  </span>
                  <span className="text-[10px] font-mono font-bold text-brand-accent bg-brand-accent/5 border border-brand-accent/20 px-3 py-1 rounded">
                    ACTIVE CACHE: 99.45%
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
