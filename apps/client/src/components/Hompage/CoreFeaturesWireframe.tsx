'use client';

import React from 'react';
import { PenTool, Image as ImageIcon, LayoutGrid, Webhook } from 'lucide-react';

export default function CoreFeaturesWireframe() {
  return (
    <section className="py-20 lg:py-28 bg-brand-bg relative overflow-hidden border-b border-brand-border" id="core-features-wireframe">
      {/* Subtle blueprint grid overlay inside the section */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" id="wf-grid-svg">
          <defs>
            <pattern id="wf-grid-pattern" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wf-grid-pattern)" />
        </svg>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Content */}
        <div className="max-w-4xl space-y-4 text-left mb-12" id="wireframe-features-header">
          <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl" id="wireframe-features-title">
            What Wriven does
          </h2>
          <div className="space-y-1 text-text-secondary text-sm md:text-base font-light leading-relaxed max-w-2xl" id="wireframe-features-description">
            <p>
              Four pillars of the platform — all shipped and working today.
            </p>
            <p>
              AI writing, media management, headless modeling, and developer-grade delivery.
            </p>
          </div>
        </div>

        {/* Wireframe Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="wireframe-cards-grid">
          
          {/* Card 1: AI writing */}
          <div 
            className="group bg-brand-surface border border-brand-border rounded-xl p-6 flex flex-col justify-between min-h-[190px] transition-all duration-300 hover:border-brand-accent/40 hover:-translate-y-1 hover:shadow-lgCard"
            style={{ contentVisibility: 'auto' }}
            id="wireframe-card-1"
          >
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-brand-accent/5 border border-brand-accent/15 flex items-center justify-center text-brand-accent group-hover:bg-brand-accent/10 transition-all" id="card-icon-1">
                <PenTool className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-text-primary tracking-tight" id="card-title-1">
                AI writing
              </h3>
            </div>
            <p className="text-sm text-text-secondary font-light mt-4 leading-relaxed" id="card-desc-1">
              Generate, refine, and compose entries in your brand voice
            </p>
          </div>

          {/* Card 2: Image gen */}
          <div 
            className="group bg-brand-surface border border-brand-border rounded-xl p-6 flex flex-col justify-between min-h-[190px] transition-all duration-300 hover:border-brand-accent/40 hover:-translate-y-1 hover:shadow-lgCard"
            style={{ contentVisibility: 'auto' }}
            id="wireframe-card-2"
          >
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-brand-accent/5 border border-brand-accent/15 flex items-center justify-center text-brand-accent group-hover:bg-brand-accent/10 transition-all" id="card-icon-2">
                <ImageIcon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-text-primary tracking-tight" id="card-title-2">
                Media library
              </h3>
            </div>
            <p className="text-sm text-text-secondary font-light mt-4 leading-relaxed" id="card-desc-2">
              Upload, organize, and reference assets per project
            </p>
          </div>

          {/* Card 3: CMS */}
          <div 
            className="group bg-brand-surface border border-brand-border rounded-xl p-6 flex flex-col justify-between min-h-[190px] transition-all duration-300 hover:border-brand-accent/40 hover:-translate-y-1 hover:shadow-lgCard"
            style={{ contentVisibility: 'auto' }}
            id="wireframe-card-3"
          >
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-brand-accent/5 border border-brand-accent/15 flex items-center justify-center text-brand-accent group-hover:bg-brand-accent/10 transition-all" id="card-icon-3">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-text-primary tracking-tight" id="card-title-3">
                Headless CMS
              </h3>
            </div>
            <p className="text-sm text-text-secondary font-light mt-4 leading-relaxed" id="card-desc-3">
              Model content types, draft, and publish entries
            </p>
          </div>

          {/* Card 4: Webhooks */}
          <div
            className="group bg-brand-surface border border-brand-border rounded-xl p-6 flex flex-col justify-between min-h-[190px] transition-all duration-300 hover:border-brand-accent/40 hover:-translate-y-1 hover:shadow-lgCard"
            style={{ contentVisibility: 'auto' }}
            id="wireframe-card-4"
          >
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-brand-accent/5 border border-brand-accent/15 flex items-center justify-center text-brand-accent group-hover:bg-brand-accent/10 transition-all" id="card-icon-4">
                <Webhook className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-text-primary tracking-tight" id="card-title-4">
                Webhooks
              </h3>
            </div>
            <p className="text-sm text-text-secondary font-light mt-4 leading-relaxed" id="card-desc-4">
              Signed hooks fire on publish, unpublish, and delete
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}
