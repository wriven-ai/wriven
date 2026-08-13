'use client';

import React from 'react';
import { PenTool, Image as ImageIcon, LayoutGrid, TrendingUp } from 'lucide-react';

export default function CoreFeaturesWireframe() {
  return (
    <section className="py-20 lg:py-28 bg-[#090E0C] text-white relative overflow-hidden border-b border-[#121E19]" id="core-features-wireframe">
      {/* Subtle blueprint grid overlay inside the dark section */}
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
          <h2 className="font-display font-medium tracking-tight text-white text-3xl sm:text-4xl" id="wireframe-features-title">
            What Wriven does
          </h2>
          <div className="space-y-1 text-[#99A6A0] text-sm md:text-base font-light leading-relaxed max-w-2xl" id="wireframe-features-description">
            <p>
              3-4 feature cards, each with an icon, short name, and one-line description.
            </p>
            <p>
              Covers the main pillars: AI writing, image generation, CMS publishing, and maybe analytics/SEO.
            </p>
          </div>
        </div>

        {/* Wireframe Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="wireframe-cards-grid">
          
          {/* Card 1: AI writing */}
          <div 
            className="group bg-[#111815] border border-[#21322B] rounded-xl p-6 flex flex-col justify-between min-h-[190px] transition-all duration-300 hover:border-[#0FAF7B]/40 hover:-translate-y-1 hover:shadow-lgCard"
            style={{ contentVisibility: 'auto' }}
            id="wireframe-card-1"
          >
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-[#0FAF7B]/5 border border-[#0FAF7B]/15 flex items-center justify-center text-[#0FAF7B] group-hover:bg-[#0FAF7B]/10 transition-all" id="card-icon-1">
                <PenTool className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-tight" id="card-title-1">
                AI writing
              </h3>
            </div>
            <p className="text-sm text-[#99A6A0] font-light mt-4 leading-relaxed" id="card-desc-1">
              Draft, edit, and rewrite with one prompt
            </p>
          </div>

          {/* Card 2: Image gen */}
          <div 
            className="group bg-[#111815] border border-[#21322B] rounded-xl p-6 flex flex-col justify-between min-h-[190px] transition-all duration-300 hover:border-[#0FAF7B]/40 hover:-translate-y-1 hover:shadow-lgCard"
            style={{ contentVisibility: 'auto' }}
            id="wireframe-card-2"
          >
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-[#0FAF7B]/5 border border-[#0FAF7B]/15 flex items-center justify-center text-[#0FAF7B] group-hover:bg-[#0FAF7B]/10 transition-all" id="card-icon-2">
                <ImageIcon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-tight" id="card-title-2">
                Image gen
              </h3>
            </div>
            <p className="text-sm text-[#99A6A0] font-light mt-4 leading-relaxed" id="card-desc-2">
              Generate on-brand visuals instantly
            </p>
          </div>

          {/* Card 3: CMS */}
          <div 
            className="group bg-[#111815] border border-[#21322B] rounded-xl p-6 flex flex-col justify-between min-h-[190px] transition-all duration-300 hover:border-[#0FAF7B]/40 hover:-translate-y-1 hover:shadow-lgCard"
            style={{ contentVisibility: 'auto' }}
            id="wireframe-card-3"
          >
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-[#0FAF7B]/5 border border-[#0FAF7B]/15 flex items-center justify-center text-[#0FAF7B] group-hover:bg-[#0FAF7B]/10 transition-all" id="card-icon-3">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-tight" id="card-title-3">
                CMS
              </h3>
            </div>
            <p className="text-sm text-[#99A6A0] font-light mt-4 leading-relaxed" id="card-desc-3">
              Publish and manage all your content
            </p>
          </div>

          {/* Card 4: Analytics */}
          <div 
            className="group bg-[#111815] border border-[#21322B] rounded-xl p-6 flex flex-col justify-between min-h-[190px] transition-all duration-300 hover:border-[#0FAF7B]/40 hover:-translate-y-1 hover:shadow-lgCard"
            style={{ contentVisibility: 'auto' }}
            id="wireframe-card-4"
          >
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-[#0FAF7B]/5 border border-[#0FAF7B]/15 flex items-center justify-center text-[#0FAF7B] group-hover:bg-[#0FAF7B]/10 transition-all" id="card-icon-4">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white tracking-tight" id="card-title-4">
                Analytics
              </h3>
            </div>
            <p className="text-sm text-[#99A6A0] font-light mt-4 leading-relaxed" id="card-desc-4">
              Track reach, SEO, and engagement
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}
