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
            Everything a modern headless CMS needs — structured modeling, AI-assisted drafting, media management, and a developer-grade delivery API.
          </p>
        </div>

        {/* Features Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-6" id="features-grid">
          
          {/* Feature 1 */}
          <div className="space-y-4 text-left" id="feature-card-1">
            <div className="text-brand-accent text-sm font-mono font-bold tracking-wider">01</div>
            <h3 className="text-sm font-bold font-mono uppercase text-text-primary">AI Content Drafting</h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Generate or refine any field with the built-in co-writer, or compose an entire entry in one pass — guided by a per-project brand voice, glossary, and language profile.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="space-y-4 text-left md:border-l md:border-brand-border md:pl-10" id="feature-card-2">
            <div className="text-brand-accent text-sm font-mono font-bold tracking-wider">02</div>
            <h3 className="text-sm font-bold font-mono uppercase text-text-primary">Media Library</h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Upload images through presigned, direct-to-storage requests and reference them from any content type. Files are stored as object keys and resolved to URLs only at delivery time.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="space-y-4 text-left md:border-l md:border-brand-border md:pl-10" id="feature-card-3">
            <div className="text-brand-accent text-sm font-mono font-bold tracking-wider">03</div>
            <h3 className="text-sm font-bold font-mono uppercase text-text-primary">Delivery API</h3>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Published entries served over a clean REST API with project-scoped keys. Select fields, filter, sort, paginate, and expand references in a single query — CDN-cacheable with tag-based purge on publish.
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}
