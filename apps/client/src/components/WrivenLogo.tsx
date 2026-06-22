import React from 'react';

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
}

export default function WrivenLogo({ className = "", iconOnly = false }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`} id="wriven-logo-container">
      <svg
        width="32"
        height="32"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        id="wriven-svg-logo"
      >
        {/* Weaving Loom Structural Rails (Charcoal base) */}
        <rect x="20" y="20" width="8" height="60" rx="2" fill="var(--text-primary)" />
        <rect x="72" y="20" width="8" height="60" rx="2" fill="var(--text-primary)" />
        
        {/* Horizontal Weft threads (Interlaced Terracotta) */}
        <rect x="24" y="32" width="52" height="6" rx="1.5" fill="var(--brand-accent)" />
        <rect x="24" y="48" width="52" height="6" rx="1.5" fill="var(--text-primary)" className="opacity-90" />
        <rect x="24" y="64" width="52" height="6" rx="1.5" fill="var(--brand-accent)" />
        
        {/* Warp tension connectors (Fine thread points) */}
        <circle cx="24" cy="35" r="4" fill="var(--brand-bg)" stroke="var(--brand-accent)" strokeWidth="2" />
        <circle cx="76" cy="35" r="4" fill="var(--brand-bg)" stroke="var(--brand-accent)" strokeWidth="2" />
        <circle cx="24" cy="51" r="4" fill="var(--brand-bg)" stroke="var(--text-primary)" strokeWidth="2" />
        <circle cx="76" cy="51" r="4" fill="var(--brand-bg)" stroke="var(--text-primary)" strokeWidth="2" />
        <circle cx="24" cy="67" r="4" fill="var(--brand-bg)" stroke="var(--brand-accent)" strokeWidth="2" />
        <circle cx="76" cy="67" r="4" fill="var(--brand-bg)" stroke="var(--brand-accent)" strokeWidth="2" />
      </svg>
      
      {!iconOnly && (
         <span 
          className="font-display text-xl font-bold tracking-tight text-text-primary flex items-baseline gap-0.5"
          id="wriven-logo-text"
        >
          Wriven
          <span className="w-1.5 h-1.5 rounded-full bg-brand-accent inline-block"></span>
        </span>
      )}
    </div>
  );
}
