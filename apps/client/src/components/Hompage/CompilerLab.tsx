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
          <span className="text-xs font-semibold tracking-wider text-brand-secondary uppercase">
            Edge Compiler pipeline
          </span>
          <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl">
            Watch content compile to edge structures
          </h2>
        </div>

        {/* Horizontal Timeline Divider Component */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6 pb-12 border-b border-brand-border" id="pipeline-timeline">
          {[
            { id: 0, title: "01/ Source Ingest", desc: "Markdown body stream with raw image asset pointers." },
            { id: 1, title: "02/ Loom Compile", desc: "Semantic enrichment, automatic metatags, layout weaving." },
            { id: 2, title: "03/ Edge Distribution", desc: "Global asset purge, static cached routes re-triggered in 12ms." }
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
                  <span className={`text-xs font-mono font-bold tracking-wider ${isActive ? 'text-brand-accent' : 'text-text-primary'}`}>
                    {step.title}
                  </span>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-ping" />}
                </div>
                <p className="text-2xs text-text-secondary leading-normal font-light">{step.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Status Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-10 text-left">
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-2 text-[9px] font-mono font-bold text-text-muted uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5 text-brand-accent" />
              Wriven Dev-Agent Logs
            </div>
            <div className="text-xs font-light text-text-secondary leading-relaxed">
              Every asset, draft, and configuration undergoes our high-performance inking compilation pipeline to serve pristine, schema-compliant JSON payloads.
            </div>
            
            <div className="flex items-center gap-2 pt-2">
              <span className="text-2xs font-mono text-text-muted">Autoplay Switch:</span>
              <button 
                onClick={() => setLabAutoPlay(!labAutoPlay)}
                className="px-2.5 py-1 rounded bg-brand-surface-soft border border-brand-border text-2xs font-mono text-text-primary hover:border-brand-accent transition-all cursor-pointer font-bold"
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
                  <span className="text-brand-accent font-mono text-xs font-bold block">$ wriven-cli ingest --source=draft_7020</span>
                  <div className="text-xs text-text-secondary font-mono leading-relaxed space-y-1">
                    <div>Analyzing layout models of blog entry template...</div>
                    <div className="text-green-600 font-bold flex items-center gap-1.5 pt-1">
                      <Check className="w-3.5 h-3.5 text-brand-accent stroke-[3]" /> Checked markdown layout rules successfully
                    </div>
                  </div>
                  
                  <div className="text-text-primary font-mono whitespace-pre-wrap leading-relaxed border border-brand-border bg-brand-surface-soft p-4 rounded-lg text-2xs overflow-x-auto">
{`{
  "title": "Ingested draft titled 'Sovereign Headless Aesthetics'",
  "author_id": "usr_9921",
  "content_raw": "## Pure paper, raw print grid\\nWeave layout endpoints...",
  "assets": ["https://picsum.photos/seed/sovereign/1200/800"]
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
                  <span className="text-brand-accent font-mono text-xs font-bold block">$ wriven-cli compile --algorithm=weaver-v2</span>
                  <div className="text-xs text-text-secondary font-mono leading-relaxed space-y-3">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-brand-accent animate-spin" />
                      <span>Parsing keywords & compiling layout configurations...</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Injected tags:</span>
                      <span className="text-text-primary px-1.5 py-0.5 ml-1.5 bg-brand-surface-soft border border-brand-border rounded text-2xs">#Aesthetics</span>
                      <span className="text-text-primary px-1.5 py-0.5 ml-1.5 bg-brand-surface-soft border border-brand-border rounded text-2xs">#Headless</span>
                    </div>
                    <div className="text-amber-600 font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Synthesizing inline copywriting tone to Casual
                    </div>
                  </div>
                  <div className="bg-brand-surface-soft p-4 border border-brand-border rounded-lg text-2xs font-mono text-text-secondary">
                    [COMPILER SUCCESS] Layout model weaved with optimum metadata tags.
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
                  <span className="text-brand-accent font-mono text-xs font-bold block">$ wriven-cli serve --edge-flush</span>
                  <div className="text-xs text-text-secondary font-mono leading-relaxed">
                    <div className="text-green-600 font-bold flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-green-600 stroke-[3]" /> Route compiled & published globally
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-2xs font-mono border-t border-brand-border pt-4 text-text-secondary">
                    <div>Edge Node Push Key:</div>
                    <div className="text-text-primary font-bold">cdn_tokyo_hnd_3</div>
                    <div>Flush duration:</div>
                    <div className="text-text-primary font-bold">12ms (Completed)</div>
                    <div>Query payload:</div>
                    <div className="text-brand-accent font-bold">GET /api/v1/posts/sovereign</div>
                  </div>
                  <div className="text-2xs bg-brand-surface-soft text-text-primary p-4 border border-brand-border rounded-lg overflow-x-auto font-mono">
                    {"{\"cached\": true, \"age\": \"0s\", \"payload\": {\"title\": \"Sovereign Headless\"}}"}
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
