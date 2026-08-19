'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/** Dark code block with a copy button. Client component (clipboard + state). */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100">
      {lang ? (
        <span className="absolute left-4 top-3 font-mono text-sm font-bold uppercase tracking-widest text-zinc-500">
          {lang}
        </span>
      ) : null}
      <button
        onClick={copy}
        className="absolute right-2.5 top-2.5 flex min-h-10 min-w-10 items-center justify-center rounded border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/20"
        aria-label="Copy code"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      <pre className="overflow-x-auto p-5 pt-9 font-mono text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
