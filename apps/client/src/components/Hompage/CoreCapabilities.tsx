'use client';

import React from 'react';

export default function CoreCapabilities() {
  return (
    <section className="py-20 lg:py-28 bg-brand-surface relative overflow-hidden border-b border-brand-border" id="features">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-20">
          <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase">
            Platform Capabilities
          </span>
          <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl" id="features-headline">
            Weave, structure, and scale your digital assets
          </h2>
          <p className="text-text-secondary text-base font-light">
            Everything you require from a high-end, high-contrast headless engine, built natively with integrated AI nodes.
          </p>
        </div>

        {/* Features Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-6" id="features-grid">
          
          {/* Feature 1 */}
          <div className="space-y-4 text-left" id="feature-card-1">
            <div className="text-brand-accent text-sm font-mono font-bold tracking-wider">01</div>
            <h3 className="text-sm font-bold font-mono uppercase text-text-primary">Content Drafting</h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Generate blog content pages, localized descriptions, meta definitions or specs list items directly on canvas. Invoke the Sparkle shortcut beside any input node for instant workflow integration.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="space-y-4 text-left md:border-l md:border-brand-border md:pl-10" id="feature-card-2">
            <div className="text-brand-accent text-sm font-mono font-bold tracking-wider">02</div>
            <h3 className="text-sm font-bold font-mono uppercase text-text-primary">Graphic Automation</h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Direct Wriven backend nodes to construct beautifully composed abstract cover layouts or banner structures. High-contrast assets register with corresponding SEO tags instantly.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="space-y-4 text-left md:border-l md:border-brand-border md:pl-10" id="feature-card-3">
            <div className="text-brand-accent text-sm font-mono font-bold tracking-wider">03</div>
            <h3 className="text-sm font-bold font-mono uppercase text-text-primary">Secure Edge Delivery</h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Fetch structured JSON packages secure at lightning-speed over cached global nodes. Feed content blocks securely to client frameworks, mobile apps or desktop interfaces.
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}
