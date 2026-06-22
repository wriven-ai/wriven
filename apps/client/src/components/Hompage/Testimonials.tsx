'use client';

import React from 'react';

export default function Testimonials() {
  return (
    <section className="py-20 lg:py-28 bg-brand-surface relative overflow-hidden border-b border-brand-border" id="testimonials">
      {/* Subtle paper grid overlay */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none editorial-grid" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          
          {/* Left Column: Bold Editorial Pitch & Platform Metrics */}
          <div className="lg:col-span-5 space-y-8 text-left" id="testimonials-pitch">
            <div className="space-y-4">
              <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl">
                The headless verdict
              </h2>
              <p className="text-text-secondary text-sm font-light leading-relaxed">
                Wriven is built for creators who value clean structural data, blazing-fast asset pipelines, and editorial control. Here is why modern platforms choose our engine.
              </p>
            </div>

            {/* Technical stats ledger boxes */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-brand-border" id="testimonials-stats">
              <div className="p-4 bg-brand-bg border border-brand-border rounded-lg space-y-1">
                <span className="block font-mono text-[9px] text-[#0FAF7B] font-bold">{"// LATENCY_DROP"}</span>
                <span className="block text-xl font-bold font-display text-text-primary">12ms</span>
                <span className="block text-[9px] text-text-muted font-mono leading-relaxed">Average Edge Response</span>
              </div>
              <div className="p-4 bg-brand-bg border border-brand-border rounded-lg space-y-1">
                <span className="block font-mono text-[9px] text-brand-secondary font-bold">{"// USER_RATING"}</span>
                <span className="block text-xl font-bold font-display text-text-primary">4.9 / 5</span>
                <span className="block text-[9px] text-text-muted font-mono leading-relaxed">Across platform reviews</span>
              </div>
            </div>

            <div className="pt-2 text-[10px] font-mono text-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0FAF7B]" />
              <span>ALL VERDICTS INDEPENDENTLY REGISTERED</span>
            </div>
          </div>

          {/* Right Column: Premium Custom Reviews Stack */}
          <div className="lg:col-span-7 space-y-6" id="testimonials-list">
            
            {/* Review Item 1 */}
            <div 
              className="group bg-brand-bg border border-brand-border rounded-xl p-6 sm:p-8 space-y-6 transition-all duration-300 hover:border-[#0FAF7B]/30 hover:shadow-sm"
              id="testimonial-card-1"
            >
              <blockquote className="text-text-primary text-xs sm:text-sm font-light leading-relaxed italic">
                &ldquo;We migrated 14,000 architectural spec nodes to Wriven. Cold start page loads dropped to zero, and editorial draft-to-publish speed increased by 300%. The headless JSON distribution structure is pure art.&rdquo;
              </blockquote>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-brand-border/70">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-surface-soft border border-brand-border-button flex items-center justify-center font-mono text-xs font-bold text-brand-accent">
                    ES
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text-primary">Evelyn Sterling</div>
                    <div className="text-[10px] text-text-secondary">VP of Product, ArchDaily Studio</div>
                  </div>
                </div>
                
                <span className="inline-flex self-start sm:self-center bg-[#0FAF7B]/5 text-[#15D296] border border-[#0FAF7B]/15 font-mono text-[9px] font-bold px-2 py-0.5 rounded">
                  {"// STACK: GATSBY + EDGE"}
                </span>
              </div>
            </div>

            {/* Review Item 2 */}
            <div 
              className="group bg-brand-bg border border-brand-border rounded-xl p-6 sm:p-8 space-y-6 transition-all duration-300 hover:border-brand-secondary/35 hover:shadow-sm"
              id="testimonial-card-2"
            >
              <blockquote className="text-text-primary text-xs sm:text-sm font-light leading-relaxed italic">
                &ldquo;The built-in prompt-based content weaver is fully connected. Wriven doesn&apos;t feel like a cold file vault; it feels like an organic draft sandbox. Truly a beautiful, layout-aware editorial ecosystem.&rdquo;
              </blockquote>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-brand-border/70">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-surface-soft border border-brand-border-button flex items-center justify-center font-mono text-xs font-bold text-brand-secondary">
                    MC
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text-primary">Marcus Chen</div>
                    <div className="text-[10px] text-text-secondary">Design Director, Monocle Reader</div>
                  </div>
                </div>
                
                <span className="inline-flex self-start sm:self-center bg-brand-secondary/5 text-brand-secondary border border-brand-secondary/15 font-mono text-[9px] font-bold px-2 py-0.5 rounded">
                  {"// STACK: NEXT.JS + TAILWIND"}
                </span>
              </div>
            </div>

            {/* Review Item 3 */}
            <div 
              className="group bg-brand-bg border border-brand-border rounded-xl p-6 sm:p-8 space-y-6 transition-all duration-300 hover:border-[#0FAF7B]/30 hover:shadow-sm"
              id="testimonial-card-3"
            >
              <blockquote className="text-text-primary text-xs sm:text-sm font-light leading-relaxed italic">
                &ldquo;Deploying raw, certified JSON blocks to our Astro publications takes under 15 milliseconds. Wriven&apos;s automated edge purging logic works flawlessly with zero hydration errors. Highly recommended.&rdquo;
              </blockquote>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-brand-border/70">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-surface-soft border border-brand-border-button flex items-center justify-center font-mono text-xs font-bold text-brand-accent">
                    ER
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text-primary">Dr. Elena Rostova</div>
                    <div className="text-[10px] text-text-secondary">Infrastructure Architect, NexaCorp</div>
                  </div>
                </div>
                
                <span className="inline-flex self-start sm:self-center bg-[#0FAF7B]/5 text-[#15D296] border border-[#0FAF7B]/15 font-mono text-[9px] font-bold px-2 py-0.5 rounded">
                  {"// STACK: ASTRO + CDN"}
                </span>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
