'use client';

import React from 'react';
import { Bookmark } from 'lucide-react';

export default function ProblemStatement() {
  return (
    <section className="py-20 bg-brand-surface relative overflow-hidden border-b border-brand-border" id="problem-statement">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 relative z-10" id="problem-statement-inner">
        <div className="space-y-8">
          <div className="text-center space-y-3">
            <span className="text-sm font-mono tracking-widest text-brand-accent font-bold uppercase bg-brand-surface-soft border border-brand-border px-3 py-1.5 rounded-md inline-block">
              MANIFEST 01. THE DISCONNECTED GRAPH
            </span>
            <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl" id="problem-title">
              Content workflows are fragmented.
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pt-4 items-start text-left">
            {/* Left side dropcap editorial column */}
            <div className="md:col-span-7 space-y-4">
              <p className="text-sm text-text-secondary leading-relaxed font-light" id="problem-body">
                <span className="float-left text-5xl font-display font-bold text-brand-accent mr-2.5 mt-1 leading-[0.8]">C</span>
                ontent managers are trapped copying and pasting raw text between headless databases, isolated AI models, and local document systems. Images must be cropped locally; metadata tags must be written separately; developers must recompile and push repositories manually just to revise simple typos.
              </p>
              <p className="text-sm text-text-secondary leading-relaxed font-light">
                This leaves teams wasting crucial hours at the interface, trading beautiful composition craft for mundane copy-paste labor across incompatible applications.
              </p>
            </div>

            {/* Right side key prompt outcome */}
            <div className="md:col-span-5 bg-brand-surface-soft border border-brand-border p-5 rounded-lg space-y-4 font-sans">
              <Bookmark className="w-5 h-5 text-brand-accent" />
              <p className="text-sm text-text-primary leading-relaxed" id="problem-solution-prompt">
                &ldquo;Wriven weaves the entire workflow. We believe that structured content models, layout drafting, and integrated copywriters belong on the same physical desktop layout.&rdquo;
              </p>
              <div className="h-[1px] bg-brand-border" />
              <div className="flex justify-between items-center text-sm font-mono text-text-muted">
                <span>— THE WRIVEN EDITORIAL COMMITTEE</span>
                <span>JUNE 2026</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
