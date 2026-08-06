'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export default function PricingBanner() {
  return (
    <section className="py-20 lg:py-24 bg-brand-bg relative overflow-hidden border-b border-brand-border" id="home-pricing-block">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="py-12 border-t border-b border-brand-border flex flex-col lg:flex-row items-center justify-between gap-12 text-left" id="pricing-banner-card">
          
          <div className="space-y-4 max-w-2xl" id="pricing-banner-text">
            <span className="text-sm font-mono tracking-widest text-brand-accent font-bold uppercase">
              [VOLUME_TIERS // TRANSPARENT_PRICING]
            </span>
            <h3 className="font-display font-medium tracking-tight text-text-primary text-2xl sm:text-3xl" id="pricing-banner-title">
              Transparent plans for modern authors
            </h3>
            <p className="text-text-secondary text-sm sm:text-sm font-light leading-relaxed">
              Begin inking copy completely free of charge, up to 500 entries per month. Graduate to higher plans when you require custom webhooks, secure developer seats, or advanced layouts.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0 w-full sm:w-auto" id="pricing-banner-buttons">
            <Link
              href="/pricing"
              className="w-full sm:w-auto inline-flex items-center justify-center bg-brand-surface text-text-secondary border border-brand-border hover:border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider px-6 py-4 rounded-lg transition-all"
              id="h-pricing-explore-btn"
            >
              View Features Table
            </Link>
            
            <Link
              href="/pricing"
              className="w-full sm:w-auto inline-flex items-center justify-center bg-brand-accent hover:bg-brand-accent-hover text-white font-mono font-bold text-sm uppercase tracking-wider px-6 py-4 rounded-lg transition-all"
              id="h-pricing-plan-btn"
            >
              See Pricing Details
              <ChevronRight className="w-4 h-4 ml-1 text-white" />
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
}
