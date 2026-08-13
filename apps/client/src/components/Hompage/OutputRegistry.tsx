'use client';

import React, { useState } from 'react';
import { Globe, Cpu, Layers3, FileJson, Layers, Bookmark, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function OutputRegistry() {
  const [activeOutputTab, setActiveOutputTab] = useState<'nextjs' | 'ios' | 'json' | 'astro'>('nextjs');

  return (
    <section className="py-20 lg:py-28 bg-brand-surface relative overflow-hidden border-b border-brand-border" id="delivery-registry">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Info & Navigation Column */}
          <div className="lg:col-span-5 space-y-8 text-left">
            <div className="space-y-3">
              <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase">
                Multi-Channel Delivery
              </span>
              <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl">
                Deploy contents to any framework instantly
              </h2>
              <p className="text-text-secondary text-sm font-light leading-relaxed">
                Wriven decouples editorial copy from display logic. Stream pristine structured feeds directly into modern web frameworks, static sites, native applications, or developer CLI shells.
              </p>
            </div>

            {/* Flat list selectors */}
            <div className="flex flex-col border-t border-brand-border divide-y divide-brand-border">
              {[
                { id: 'nextjs', name: 'NextJS Web Application', key: '01', desc: 'Sovereign client portals and reactive components', icon: Globe },
                { id: 'ios', name: 'iOS Mobile Reader', key: '02', desc: 'Secure native app viewports and RSS cards', icon: Cpu },
                { id: 'astro', name: 'Astro Static Publication', key: '03', desc: 'Ultra-fast optimized static pages', icon: Layers3 },
                { id: 'json', name: 'Structural JSON payload', key: '04', desc: 'Raw verified content blocks over REST/GraphQL', icon: FileJson }
              ].map((target) => {
                const isActive = activeOutputTab === target.id;
                const IconComponent = target.icon;
                return (
                  <button
                    key={target.id}
                    onClick={() => setActiveOutputTab(target.id as any)}
                    className="py-4 text-left group transition-all focus:outline-none cursor-pointer flex items-center justify-between"
                  >
                    <div className="space-y-1 pr-4">
                      <div className="flex items-center gap-3">
                        <span className={`font-mono text-sm ${isActive ? 'text-brand-accent' : 'text-text-muted group-hover:text-text-secondary'}`}>
                          {target.key}
                        </span>
                        <span className={`text-sm font-bold uppercase tracking-wider transition-colors ${isActive ? 'text-brand-accent' : 'text-text-primary group-hover:text-brand-accent'}`}>
                          {target.name}
                        </span>
                      </div>
                      <p className="text-sm font-light text-text-secondary pl-[26px]">
                        {target.desc}
                      </p>
                    </div>
                    <div className={`p-2 rounded border transition-colors ${isActive ? 'bg-brand-accent/5 border-brand-accent text-brand-accent' : 'bg-brand-surface-soft border-brand-border text-text-muted group-hover:text-text-secondary'}`}>
                      <IconComponent className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 flex items-center gap-2 text-sm font-mono text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
              <span>REGISTRY PIPELINE: ONLINE</span>
              <span className="mx-1">•</span>
              <span>DELIVERY NODES: 100% HEALTH</span>
            </div>
          </div>

          {/* High-Fidelity Rendering Canvas Column */}
          <div className="lg:col-span-7 lg:border-l lg:border-brand-border lg:pl-12 flex flex-col justify-between self-stretch min-h-[485px]">
            
            {/* Canvas Header */}
            <div className="flex items-center justify-between border-b border-brand-border pb-4 mb-6">
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-brand-secondary" />
                <span className="font-mono text-sm font-bold text-text-muted uppercase tracking-widest">
                  LIVE CLIENT OUTPUT SIMULATION
                </span>
              </div>
              <div className="text-sm font-mono font-bold text-brand-accent bg-brand-accent/5 px-2 py-0.5 rounded border border-brand-accent/10">
                {activeOutputTab.toUpperCase()}_STAGE
              </div>
            </div>

            {/* Display Port */}
            <div className="flex-grow flex items-center justify-center relative">
              
              <AnimatePresence mode="wait">
                {activeOutputTab === 'nextjs' && (
                  <motion.div
                    key="render-nextjs"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.25 }}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg p-6 shadow-sm text-left font-sans space-y-4 relative overflow-hidden"
                  >
                    {/* Fake browser bar */}
                    <div className="flex items-center gap-1.5 pb-3 border-b border-brand-border mb-2 text-text-muted">
                      <span className="w-2 h-2 rounded-full bg-brand-border" />
                      <span className="w-2 h-2 rounded-full bg-brand-border" />
                      <span className="w-2 h-2 rounded-full bg-brand-border" />
                      <span className="text-sm font-mono ml-2">https://localhost:3000/blog/future-of-wearables</span>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-brand-accent bg-brand-accent/5 border border-brand-accent/10 px-2 py-0.5 uppercase tracking-wider">
                          Wellness tech
                        </span>
                        <span className="text-sm font-mono text-text-muted">June 10, 2026</span>
                      </div>
                      
                      <h3 className="font-display font-medium text-text-primary text-xl sm:text-2xl tracking-tight leading-snug">
                        Unlocking Wellness: The Future of Smart Wearables
                      </h3>

                      <div className="flex items-center gap-3 py-2 border-t border-b border-brand-border">
                        <div className="w-6 h-6 rounded-full bg-brand-surface-soft border border-brand-border flex items-center justify-center font-mono text-sm font-bold text-brand-accent">
                          W
                        </div>
                        <div>
                          <div className="text-sm font-bold text-text-primary">Wriven Editorial Compiler</div>
                          <div className="text-sm text-text-muted font-mono">1.2k reads • Localized: EN-US</div>
                        </div>
                      </div>

                      <p className="text-sm text-text-secondary font-light leading-relaxed">
                        Structured nodes assemble on the modern layout canvas flawlessly. With sovereign headless microservices, paragraphs and media arrays stream smoothly into optimized React stacks without cold-start database latency.
                      </p>

                      <div className="flex items-center gap-2 pt-2 text-sm font-semibold text-brand-accent hover:underline">
                        <span>Read article</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeOutputTab === 'ios' && (
                  <motion.div
                    key="render-ios"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.25 }}
                    className="w-full max-w-[280px] bg-brand-bg border border-brand-border rounded-2xl p-4 shadow-md text-left font-sans space-y-4 relative"
                  >
                    {/* iOS top notch simulation bar */}
                    <div className="flex justify-between items-center text-sm font-mono text-text-muted px-1.5 pb-2">
                      <span>9:41</span>
                      <span className="w-4 h-2 bg-brand-border rounded-full" />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-brand-accent font-mono font-bold tracking-wider">COGNITIVE</span>
                        <Bookmark className="w-3.5 h-3.5 text-text-muted hover:text-brand-accent" />
                      </div>

                      <div className="h-28 bg-brand-surface-soft border border-brand-border rounded-lg relative overflow-hidden flex items-center justify-center p-3">
                        <Layers className="w-8 h-8 text-brand-accent opacity-20 absolute" />
                        <div className="relative z-10 text-center space-y-1">
                          <span className="text-sm font-mono text-text-primary px-2 py-0.5 bg-brand-bg border border-brand-border rounded">Wriven App Feed</span>
                          <div className="text-sm text-text-secondary mt-1">Ingested via Core CLI</div>
                        </div>
                      </div>

                      <h4 className="font-display font-medium text-text-primary text-base leading-tight tracking-tight mt-2">
                        Aesthetic Headless Editorial Rules
                      </h4>

                      <p className="text-sm text-text-secondary leading-relaxed font-light line-clamp-3">
                        Clean static JSON vectors let native swift nodes render margins, typography scaling, and dark-theme blocks securely at 120 FPS.
                      </p>

                      <div className="bg-brand-surface-soft p-2.5 rounded border border-brand-border flex items-center justify-between text-sm font-mono text-text-primary">
                        <span>RENDER: SWIFTUI</span>
                        <span className="text-brand-accent font-bold">12ms</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeOutputTab === 'astro' && (
                  <motion.div
                    key="render-astro"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.25 }}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg p-8 shadow-sm text-left font-serif space-y-6"
                  >
                    <div className="border-b border-brand-border pb-4 space-y-1">
                      <div className="text-sm font-mono text-text-muted font-bold tracking-widest uppercase">
                        THE CHRONICLER STATIC BLOG
                      </div>
                      <h3 className="font-display font-medium text-text-primary text-xl sm:text-2xl tracking-tight leading-tight italic">
                        The Sovereignty of Print Layouts on Screen
                      </h3>
                    </div>

                    <div className="space-y-4 text-sm font-light tracking-wide text-text-secondary leading-relaxed font-sans">
                      <p>
                        Static generation engines demand raw, pre-built structural records to optimize SEO indices perfectly. By compiling markdown models into static JSON blocks, Astro loaders build clean assets instantaneously.
                      </p>
                      
                      <blockquote className="border-l-2 border-brand-accent pl-4 text-text-primary italic font-serif my-4">
                        &quot;Headless architectures render better when they omit complex runtime databases.&quot;
                      </blockquote>

                      <p>
                        Stream layouts globally without hydration locks or server overhead. The static pipeline triggers a clean purge in 12ms.
                      </p>
                    </div>
                  </motion.div>
                )}

                {activeOutputTab === 'json' && (
                  <motion.div
                    key="render-json"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.25 }}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg p-5 shadow-sm text-left font-mono text-sm overflow-x-auto relative"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-brand-border mb-3 text-text-muted">
                      <span>GET /v1/posts/wearables-wellness</span>
                      <span className="text-brand-accent">200 OK</span>
                    </div>

                    <pre className="text-text-primary leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto font-mono">
{`{
  "id": "entry_771891",
  "status": "published",
  "contentType": "blog_post",
  "meta": {
    "tags": ["Aesthetics", "Headless", "Wellness"],
    "slug": "wearables-wellness",
    "updatedAt": "2026-06-10T16:19:20Z"
  },
  "fields": {
    "title": "Unlocking Wellness: The Future of Smart Wearables",
    "body_blocks": [
      {
        "type": "heading_2",
        "value": "Pure print, raw metadata grids"
      },
      {
        "type": "paragraph",
        "value": "Structured content nodes compile flawlessly..."
      }
    ]
  }
}`}
                    </pre>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>

            {/* Technical specifications footer */}
            <div className="pt-4 mt-6 border-t border-brand-border flex items-center justify-between text-sm font-mono text-text-muted">
              <span>CACHED EDGE RECORD: HIT</span>
              <span>SERVED LENGTH: 488 BYTES</span>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
