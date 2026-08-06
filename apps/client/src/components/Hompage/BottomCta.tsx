'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function BottomCta() {
  return (
    <section className="bg-brand-surface text-text-primary py-24 relative overflow-hidden text-center" id="bottom-cta">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 relative z-10 space-y-6" id="bottom-cta-inner">
        <h2 className="font-display font-medium leading-[1.1] tracking-tight text-3xl sm:text-5xl text-text-primary" id="bottom-headline font-display">
          Ready to weave sublime <br />
          <span className="text-brand-accent font-normal">digital platforms?</span>
        </h2>
        <p className="text-text-secondary text-sm sm:text-base max-w-xl mx-auto font-light leading-relaxed" id="bottom-paragraph">
          Create your organization workspace in seconds. Design content frameworks, leverage connected drafting tools, and fetch high-speed static JSON instantly.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-3" id="bottom-actions">
          <Link
            href="/register"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider px-8 py-4.5 rounded-lg neo-shadow-lg"
            id="bottom-primary-btn"
          >
            Create your workspace free
            <ArrowRight className="w-4 h-4 text-white" />
          </Link>
        </div>
      </div>
    </section>
  );
}
