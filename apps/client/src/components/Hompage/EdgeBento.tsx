'use client';

import React, { useState } from 'react';
import { Activity, KeyRound, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

export default function EdgeBento() {
  const [showHeaders, setShowHeaders] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const triggerHeaderView = () => {
    setIsToggling(true);
    setTimeout(() => {
      setShowHeaders((prev) => !prev);
      setIsToggling(false);
    }, 400);
  };

  return (
    <section className="py-20 lg:py-28 bg-brand-bg relative overflow-hidden border-b border-brand-border" id="edge-bento">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">

        <div className="max-w-3xl mx-auto space-y-3 mb-16 text-center">
          <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase">
            Delivery &amp; Caching
          </span>
          <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl">
            Cacheable by default, purged on publish
          </h2>
          <p className="text-text-secondary text-sm font-light leading-relaxed">
            Published reads ship with CDN cache headers and surrogate tags, so a publish purges exactly the affected responses — no stale content, no manual cache work.
          </p>
        </div>

        {/* Bento Grid Architecture */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 text-left pt-6" id="telemetry-bento-grid">

          {/* Box 1: CDN cache behavior */}
          <div className="lg:col-span-8 flex flex-col justify-between space-y-6" id="bento-cache-rate">
            <div className="space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span className="text-sm font-mono font-bold uppercase text-brand-accent tracking-widest">CACHE POLICY</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-mono font-bold text-green-600 bg-green-500/5 border border-green-500/10 px-2.5 py-0.5 rounded">
                  <Activity className="w-3.5 h-3.5 animate-pulse text-green-600" />
                  <span className="hidden sm:inline">APPLIED ON EVERY PUBLISHED READ</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-center pt-2">
                <div>
                  <span className="block text-4xl sm:text-5xl font-display font-bold text-text-primary tracking-tight" id="cache-rate-display">
                    s-maxage=60
                  </span>
                  <span className="block text-sm font-mono font-bold text-brand-accent uppercase mt-1.5 tracking-wider">Plus stale-while-revalidate=300</span>
                  <p className="text-sm text-text-secondary font-light mt-2 leading-relaxed font-sans">
                    Responses carry <code className="font-mono text-text-primary">Cache-Tag</code> / <code className="font-mono text-text-primary">Surrogate-Key</code> headers scoped to the project, type, and entry — publishing purges by tag.
                  </p>
                </div>

                {/* Mini graphic visual block */}
                <div className="h-28 flex items-end justify-between p-4 relative overflow-hidden border-b border-brand-border">
                  <div className="absolute top-0 left-0 text-sm font-mono font-bold text-text-muted">PUBLISHED READS · CDN-CACHEABLE</div>

                  {/* Decorative bar visual */}
                  {[65, 87, 92, 79, 84, 98, 92, 99].map((height, idx) => (
                    <div key={idx} className="w-3.5 bg-brand-accent/10 rounded-t relative group flex flex-col justify-end h-16">
                      <motion.div
                        className="bg-brand-accent rounded-t w-full"
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ duration: 1, delay: idx * 0.1 }}
                      />
                    </div>
                  ))}
                </div>

              </div>
            </div>

            <div className="pt-6 border-t border-brand-border/75 mt-6 flex flex-wrap gap-4 items-center justify-between">
              <span className="text-sm font-mono text-text-secondary leading-relaxed max-w-sm">
                Draft preview reads are never cached — they always serve fresh content with <code className="text-text-primary">no-store</code>.
              </span>
              <button
                onClick={triggerHeaderView}
                disabled={isToggling}
                className="inline-flex items-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white py-3 px-5 text-sm font-mono font-bold uppercase tracking-wider rounded-lg border border-brand-border-button neo-shadow cursor-pointer disabled:bg-gray-400 transition-all ml-auto sm:ml-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isToggling ? 'animate-spin' : ''}`} />
                {showHeaders ? "HIDE HEADERS" : "VIEW RESPONSE HEADERS"}
              </button>
            </div>

            {showHeaders && (
              <div className="text-sm font-mono rounded-lg bg-brand-surface-soft border border-brand-border p-4 space-y-1.5 text-left">
                <div><span className="text-text-muted">Cache-Control:</span> <span className="text-text-primary font-bold">public, s-maxage=60, stale-while-revalidate=300</span></div>
                <div><span className="text-text-muted">Cache-Tag:</span> <span className="text-text-primary font-bold">proj_2f9c type_posts entry_771891</span></div>
                <div><span className="text-text-muted">Surrogate-Key:</span> <span className="text-text-primary font-bold">proj_2f9c type_posts entry_771891</span></div>
              </div>
            )}
          </div>

          {/* Box 2: API key scopes & guardrails */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-6 lg:border-l lg:border-brand-border lg:pl-10" id="bento-node-pings">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono font-bold uppercase text-brand-accent tracking-widest">API KEYS &amp; GUARDRAILS</span>
                <KeyRound className="w-4 h-4 text-brand-accent" />
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { icon: "READ", title: "Read keys", detail: "Published entries only" },
                  { icon: "PREVIEW", title: "Preview keys", detail: "Drafts included, never cached" },
                  { icon: "MANAGE", title: "Manage keys", detail: "Full content access" },
                  { icon: "LIMITS", title: "Rate limits", detail: "Global + per-route throttling" },
                  { icon: "USAGE", title: "Usage metering", detail: "Requests tracked per workspace" },
                ].map((row) => (
                  <div key={row.icon} className="flex justify-between items-center py-2.5 border-b border-brand-border last:border-0">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm text-brand-accent font-bold">
                        {row.icon}
                      </span>
                      <span className="text-sm font-bold text-text-primary">{row.title}</span>
                    </div>
                    <span className="text-sm font-mono text-text-secondary">{row.detail}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 text-sm text-text-secondary leading-relaxed font-light border-t border-brand-border mt-4">
              Keys are project-scoped and hash-stored — a key can never read another project&apos;s content.
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
