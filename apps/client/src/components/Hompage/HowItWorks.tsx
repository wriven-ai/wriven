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
            From an empty project to published, queryable JSON in three phases.
          </p>
        </div>

        {/* Open stepwise timeline with zero enclosing boxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-6" id="how-grid">
          
          {/* Step 1 */}
          <div className="text-left space-y-4" id="how-step-1">
            <div className="text-4xl font-display font-medium text-brand-accent select-none">01/</div>
            <h3 className="text-sm font-mono font-bold uppercase text-text-primary">
              Define Your Content Model
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Build content types with the visual field builder — text, rich text, media, and reference fields, with unique and multiple constraints. Every entry is validated against your schema.
            </p>
          </div>

          {/* Step 2 */}
          <div className="text-left space-y-4 md:border-l md:border-brand-border md:pl-10" id="how-step-2">
            <div className="text-4xl font-display font-medium text-brand-accent select-none">02/</div>
            <h3 className="text-sm font-mono font-bold uppercase text-text-primary">
              Draft With the AI Co-Writer
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Write manually, or use per-field Generate and Refine to draft faster. Compose an entire entry in one pass, guided by your project's brand voice, glossary, and language.
            </p>
          </div>

          {/* Step 3 */}
          <div className="text-left space-y-4 md:border-l md:border-brand-border md:pl-10" id="how-step-3">
            <div className="text-4xl font-display font-medium text-brand-accent select-none">03/</div>
            <h3 className="text-sm font-mono font-bold uppercase text-text-primary">
              Publish &amp; Query the Delivery API
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Create a project API key, publish your entries, and fetch clean JSON over REST — with field selection, filtering, sorting, pagination, and reference expansion. Signed webhooks fire on every publish.
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}
