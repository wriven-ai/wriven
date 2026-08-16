'use client';

import React from 'react';
import { History, ShieldCheck, Webhook, Sparkles } from 'lucide-react';

export default function Testimonials() {
  return (
    <section className="py-20 lg:py-28 bg-brand-surface relative overflow-hidden border-b border-brand-border" id="testimonials">
      {/* Subtle paper grid overlay */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none editorial-grid" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">

          {/* Left Column: Editorial Pitch & Plan Facts */}
          <div className="lg:col-span-5 space-y-8 text-left" id="testimonials-pitch">
            <div className="space-y-4">
              <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl">
                Built for structured content
              </h2>
              <p className="text-text-secondary text-sm font-light leading-relaxed">
                Wriven is built for teams who value clean structural data, a transparent usage model, and editorial control. Here is what the platform gives you from day one.
              </p>
            </div>

            {/* Plan fact ledger boxes */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-brand-border" id="testimonials-stats">
              <div className="p-4 bg-brand-bg border border-brand-border rounded-lg space-y-1">
                <span className="block font-mono text-sm text-[#0FAF7B] font-bold">FREE TIER</span>
                <span className="block text-xl font-bold font-display text-text-primary">500 entries</span>
                <span className="block text-sm text-text-muted font-mono leading-relaxed">per month, forever</span>
              </div>
              <div className="p-4 bg-brand-bg border border-brand-border rounded-lg space-y-1">
                <span className="block font-mono text-sm text-brand-secondary font-bold">API REQUESTS</span>
                <span className="block text-xl font-bold font-display text-text-primary">100k / mo</span>
                <span className="block text-sm text-text-muted font-mono leading-relaxed">included on the free plan</span>
              </div>
            </div>

            <div className="pt-2 text-sm font-mono text-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0FAF7B]" />
              <span>PLANS: FREE / STARTER $10 / PRO $18</span>
            </div>
          </div>

          {/* Right Column: Real Platform Capabilities */}
          <div className="lg:col-span-7 space-y-6" id="testimonials-list">

            {/* Capability 1: Revisions */}
            <div
              className="group bg-brand-bg border border-brand-border rounded-xl p-6 sm:p-8 space-y-6 transition-all duration-300 hover:border-[#0FAF7B]/30 hover:shadow-sm"
              id="testimonial-card-1"
            >
              <blockquote className="text-text-primary text-sm sm:text-sm font-light leading-relaxed italic">
                Every write records a revision. Open the history drawer, compare versions, and restore any of them — restoring itself becomes a new revision, so nothing is ever lost.
              </blockquote>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-brand-border/70">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-surface-soft border border-brand-border-button flex items-center justify-center">
                    <History className="w-4 h-4 text-brand-accent" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text-primary">Entry Revisions</div>
                    <div className="text-sm text-text-secondary">Retained per plan — 5 / 10 / 15 versions</div>
                  </div>
                </div>

                <span className="inline-flex self-start sm:self-center bg-[#0FAF7B]/5 text-[#15D296] border border-[#0FAF7B]/15 font-mono text-sm font-bold px-2 py-0.5 rounded">
                  SHIPPED
                </span>
              </div>
            </div>

            {/* Capability 2: RBAC */}
            <div
              className="group bg-brand-bg border border-brand-border rounded-xl p-6 sm:p-8 space-y-6 transition-all duration-300 hover:border-brand-secondary/35 hover:shadow-sm"
              id="testimonial-card-2"
            >
              <blockquote className="text-text-primary text-sm sm:text-sm font-light leading-relaxed italic">
                Owners, admins, and members with a granular permission catalog — resolved through workspace and project roles, enforced at the API edge and reflected in the UI.
              </blockquote>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-brand-border/70">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-surface-soft border border-brand-border-button flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-brand-secondary" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text-primary">Role-Based Access Control</div>
                    <div className="text-sm text-text-secondary">Workspace + project member management</div>
                  </div>
                </div>

                <span className="inline-flex self-start sm:self-center bg-brand-secondary/5 text-brand-secondary border border-brand-secondary/15 font-mono text-sm font-bold px-2 py-0.5 rounded">
                  SHIPPED
                </span>
              </div>
            </div>

            {/* Capability 3: AI accounting + webhooks */}
            <div
              className="group bg-brand-bg border border-brand-border rounded-xl p-6 sm:p-8 space-y-6 transition-all duration-300 hover:border-[#0FAF7B]/30 hover:shadow-sm"
              id="testimonial-card-3"
            >
              <blockquote className="text-text-primary text-sm sm:text-sm font-light leading-relaxed italic">
                AI usage is fully accounted — every generation is metered against your plan, with token and cost reporting per period. Signed webhooks with HMAC verification and retries fire on every publish, unpublish, and delete.
              </blockquote>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-brand-border/70">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-surface-soft border border-brand-border-button flex items-center justify-center">
                    <Webhook className="w-4 h-4 text-brand-accent" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-text-primary">Usage Metering &amp; Webhooks</div>
                    <div className="text-sm text-text-secondary flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-brand-accent" /> Visible on the usage dashboard
                    </div>
                  </div>
                </div>

                <span className="inline-flex self-start sm:self-center bg-[#0FAF7B]/5 text-[#15D296] border border-[#0FAF7B]/15 font-mono text-sm font-bold px-2 py-0.5 rounded">
                  SHIPPED
                </span>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
