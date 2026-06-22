'use client';

import React from 'react';

export default function WeaveRegistry() {
  const steps = [
    { num: '01', name: 'SCHEMA', label: 'STRUCTURED_MODEL' },
    { num: '02', name: 'SYNAPSE', label: 'AI_COWRITING' },
    { num: '03', name: 'REFINERY', label: 'COPY_CRAFT' },
    { num: '04', name: 'COMPILER', label: 'PAYLOAD_GEN' },
    { num: '05', name: 'DISTRIBUTE', label: 'EDGE_SHIPPED' }
  ];

  return (
    <section className="relative bg-brand-surface-soft py-10 border-b border-brand-border" id="social-proof">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <p className="text-center text-[10px] font-mono tracking-widest text-[#99A6A0] uppercase mb-5" id="logos-title">
          {"// THE WRIVEN SYNCHRONOUS ENGINE COMPILER //"}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-5xl mx-auto text-center" id="logos-flex">
          {steps.map((step) => (
            <div key={step.num} className="border border-brand-border bg-brand-surface py-3 px-2 rounded-md hover:border-brand-border-button transition-all duration-150">
              <div className="text-[9px] font-mono text-brand-accent font-bold mb-0.5">[{step.num}] {step.label}</div>
              <div className="font-display font-medium text-xs tracking-widest text-text-primary">{step.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
