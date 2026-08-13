'use client';

import React from 'react';

export default function HowItWorks() {
  return (
    <section className="py-20 lg:py-28 bg-brand-bg relative overflow-hidden border-b border-brand-border" id="how-it-works">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-20">
          <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase">
            How It Works
          </span>
          <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl" id="how-headline">
            The Wriven Technique
          </h2>
          <p className="text-text-secondary text-sm font-light">
            Transition seamlessly from initial raw models to served global CDN records in three elegant phases.
          </p>
        </div>

        {/* Open stepwise timeline with zero enclosing boxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-6" id="how-grid">
          
          {/* Step 1 */}
          <div className="text-left space-y-4" id="how-step-1">
            <div className="text-4xl font-display font-medium text-brand-accent select-none">01/</div>
            <h3 className="text-sm font-mono font-bold uppercase text-text-primary">
              Structure Collection Codes
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Create custom models with simple dropdown blocks. Form text fields, rich markdown entries, media collections, or references. Wriven registers edge API routers automatically.
            </p>
          </div>

          {/* Step 2 */}
          <div className="text-left space-y-4 md:border-l md:border-brand-border md:pl-10" id="how-step-2">
            <div className="text-4xl font-display font-medium text-brand-accent select-none">02/</div>
            <h3 className="text-sm font-mono font-bold uppercase text-text-primary">
              Weave & Refine Copy
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Input content blocks manually or direct the inline copy assistant. Instantly refine tone structures, write localized variants, and review visual templates side-by-side.
            </p>
          </div>

          {/* Step 3 */}
          <div className="text-left space-y-4 md:border-l md:border-brand-border md:pl-10" id="how-step-3">
            <div className="text-4xl font-display font-medium text-brand-accent select-none">03/</div>
            <h3 className="text-sm font-mono font-bold uppercase text-text-primary">
              Query Edge JSON APIs
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Establish secret API access tokens instantly. Retrieve JSON content rapidly over edge servers to power react cards, mobile interfaces, or static site servers securely.
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}
