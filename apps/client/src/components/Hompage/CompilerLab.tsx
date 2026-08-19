'use client';

import React, { useState, useEffect } from 'react';
import { Terminal, Check, RefreshCw, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function CompilerLab() {
  const [compilerStage, setCompilerStage] = useState(0);
  const [labAutoPlay, setLabAutoPlay] = useState(true);

  // Auto-play effect
  useEffect(() => {
    if (!labAutoPlay) return;
    const interval = setInterval(() => {
      setCompilerStage((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(interval);
  }, [labAutoPlay]);

  return (
    <section className="py-20 lg:py-28 bg-brand-surface relative overflow-hidden border-b border-brand-border" id="compiler-lab">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-left space-y-4 max-w-3xl mb-8">
          <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase">
            Publish pipeline
          </span>
          <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl">
            From draft to delivered JSON
          </h2>
        </div>

        {/* Horizontal Timeline Divider Component */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6 pb-12 border-b border-brand-border" id="pipeline-timeline">
          {[
            { id: 0, title: "01/ Draft Entry", desc: "Rich-text editor with structured fields, media references, and the AI co-writer." },
            { id: 1, title: "02/ Publish", desc: "Status flips to published, a revision is recorded, and CDN cache tags are purged." },
            { id: 2, title: "03/ Query Delivery API", desc: "Project-scoped API keys read published entries as clean JSON over REST." }
          ].map((step) => {
            const isActive = compilerStage === step.id;
            return (
              <button
                key={step.id}
                onClick={() => {
                  setCompilerStage(step.id);
                  setLabAutoPlay(false);
                }}
                className="text-left group relative pt-4 cursor-pointer focus:outline-none"
              >
                <div className={`h-[2px] w-full mb-3.5 transition-colors duration-300 ${isActive ? 'bg-brand-accent' : 'bg-brand-border group-hover:bg-brand-border-button'}`} />
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-sm font-mono font-bold tracking-wider ${isActive ? 'text-brand-accent' : 'text-text-primary'}`}>
                    {step.title}
                  </span>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-ping" />}
                </div>
                <p className="text-sm text-text-secondary leading-normal font-light">{step.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Status Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-10 text-left">
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-mono font-bold text-text-muted uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5 text-brand-accent" />
              API Request Trace
            </div>
            <div className="text-sm font-light text-text-secondary leading-relaxed">
              Every published entry is served by the delivery API with field selection, filtering, and reference expansion — CDN-cacheable responses with tag-based purge on publish.
            </div>

            <div className="flex items-center gap-2 pt-2">
              <span className="text-sm font-mono text-text-muted">Autoplay Switch:</span>
              <button
                onClick={() => setLabAutoPlay(!labAutoPlay)}
                className="px-2.5 py-1 rounded bg-brand-surface-soft border border-brand-border text-sm font-mono text-text-primary hover:border-brand-accent transition-all cursor-pointer font-bold"
              >
                {labAutoPlay ? "⏸ PAUSE LOOP" : "▶ RESUME"}
              </button>
            </div>
          </div>

          <div className="lg:col-span-8 lg:border-l lg:border-brand-border lg:pl-10">
            <AnimatePresence mode="wait">
              {compilerStage === 0 && (
                <motion.div
                  key="stage-0"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <span className="text-brand-accent font-mono text-sm font-bold block">POST /v1/content/entries</span>
                  <div className="text-sm text-text-secondary font-mono leading-relaxed space-y-1">
                    <div>Creating a draft entry of type &ldquo;Post&rdquo; in the editor...</div>
                    <div className="text-green-600 font-bold flex items-center gap-1.5 pt-1">
                      <Check className="w-3.5 h-3.5 text-brand-accent stroke-[3]" /> Fields validated against the content-type schema
                    </div>
                  </div>

                  <div className="text-text-primary font-mono whitespace-pre-wrap leading-relaxed border border-brand-border bg-brand-surface-soft p-4 rounded-lg text-sm overflow-x-auto">
{`{
  "success": true,
  "data": {
    "id": "entry_771891",
    "status": "draft",
    "contentType": "Post",
    "revision": 1,
    "fields": {
      "title": "Headless Content, Woven Together",
      "slug": "headless-content-woven-together"
    }
  }
}`}
                  </div>
                </motion.div>
              )}

              {compilerStage === 1 && (
                <motion.div
                  key="stage-1"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <span className="text-brand-accent font-mono text-sm font-bold block">POST /v1/content/entries/entry_771891/publish</span>
                  <div className="text-sm text-text-secondary font-mono leading-relaxed space-y-3">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-brand-accent animate-spin" />
                      <span>Publishing entry and recording revision 2...</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Firing signed webhooks:</span>
                      <span className="text-text-primary px-1.5 py-0.5 ml-1.5 bg-brand-surface-soft border border-brand-border rounded text-sm">entry.published</span>
                    </div>
                    <div className="text-amber-600 font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Purging CDN cache tags: proj_2f9c type_post entry_771891
                    </div>
                  </div>
                  <div className="bg-brand-surface-soft p-4 border border-brand-border rounded-lg text-sm font-mono text-text-secondary">
                    [PUBLISHED] Entry live on the delivery API. Cache-Tag purge dispatched.
                  </div>
                </motion.div>
              )}

              {compilerStage === 2 && (
                <motion.div
                  key="stage-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <span className="text-brand-accent font-mono text-sm font-bold block">GET /v1/projects/prj_2f9c/content/posts</span>
                  <div className="text-sm text-text-secondary font-mono leading-relaxed">
                    <div className="text-green-600 font-bold flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-green-600 stroke-[3]" /> 200 OK — published entries only
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm font-mono border-t border-brand-border pt-4 text-text-secondary">
                    <div>Auth:</div>
                    <div className="text-text-primary font-bold">Bearer wrk_… (read scope)</div>
                    <div>Cache-Control:</div>
                    <div className="text-text-primary font-bold">public, s-maxage=60</div>
                    <div>Query params:</div>
                    <div className="text-brand-accent font-bold">select · filter · sort · page · include</div>
                  </div>
                  <div className="text-sm bg-brand-surface-soft text-text-primary p-4 border border-brand-border rounded-lg overflow-x-auto font-mono">
                    {"{\"success\": true, \"data\": {\"items\": [{\"fields\": {\"title\": \"Headless Content, Woven Together\"}}]}}"}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </section>
  );
}
