'use client';

import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

/** Shared panel chrome (header). */
export function PanelShell({ children }: { children: ReactNode }) {
  return (
    <div
      id="wriven-ai-panel"
      className="bg-brand-surface border border-brand-border rounded-xl shadow-sm flex flex-col sticky top-4"
    >
      <div className="flex items-center gap-2 px-5 py-4 border-b border-brand-border">
        <Sparkles className="w-4 h-4 text-brand-secondary" />
        <span className="text-sm font-mono font-bold tracking-wider text-text-primary">Wriven Co-Writer</span>
        <span className="ml-auto text-xs font-mono bg-brand-secondary/10 text-brand-secondary px-2 py-0.5 rounded font-bold">AI</span>
      </div>
      {children}
    </div>
  );
}
