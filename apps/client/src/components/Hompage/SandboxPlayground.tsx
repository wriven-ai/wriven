'use client';

import React, { useState } from 'react';
import { Sparkles, Layers, Code } from 'lucide-react';

/**
 * Simulated playground. The real AI co-writer requires an account and project
 * context (it runs through the gateway against the ai-service), so this demo
 * produces canned output client-side — clearly labeled as a simulation.
 */
const SAMPLE_OUTPUTS: Record<string, Record<string, string>> = {
  blog: {
    Professional:
      'Wearables have quietly moved from step counters to genuine health companions. This guide looks at what modern sensors actually measure, which metrics matter, and how to choose a device that fits your routine.',
    Casual:
      "Let's be honest — most of us bought a smartwatch for the notifications and stayed for the health tracking. Here's what all those heart-rate charts actually tell you (and what they don't).",
    Creative:
      'On your wrist sits a small, patient witness: every heartbeat logged, every sleepless night noted. The story of modern wearables is the story of listening to that witness.',
  },
  seo: {
    Professional:
      'Title: "Headless CMS in 2026: A Practical Guide" — Meta: "How a headless CMS separates content from presentation, why AI-assisted drafting changes editorial workflows, and what to check before you commit."',
    Casual:
      'Title: "So You Are Eyeing a Headless CMS" — Meta: "The no-jargon rundown of headless CMS: what it is, why developers love it, and how AI drafting fits in."',
    Creative:
      'Title: "Your Content, Unshackled" — Meta: "Content that lives apart from its presentation. A short field guide to headless publishing and the AI that drafts alongside you."',
  },
  ecom: {
    Professional:
      'Lightweight and sweat-resistant, this running headband pairs active noise cancellation with a secure fit — engineered for long training sessions where music matters and distractions do not.',
    Casual:
      "Runs better with music, no earbuds falling out mid-sprint. Noise cancellation blocks the gym noise; the fabric stays put even when you don't.",
    Creative:
      'The city hum fades. Your playlist takes its place. Built for the runner who moves to a beat, this headband carries sound like a second heartbeat.',
  },
};

export default function SandboxPlayground() {
  const [activeSchema, setActiveSchema] = useState('blog');
  const [promptInput, setPromptInput] = useState('Write an engaging SEO-optimized intro for a smartwatch article about health tracking.');
  const [fieldTone, setFieldTone] = useState('Professional');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editorResult, setEditorResult] = useState(
    "Select a schema, a tone, adjust the prompt, and click 'Weave with AI' to preview a simulated generation."
  );
  const [jsonResponse, setJsonResponse] = useState(`{
  "success": true,
  "data": {
    "items": [
      {
        "id": "entry_771891",
        "status": "published",
        "fields": {
          "title": "Unlocking Wellness: The Future of Smart Wearables",
          "slug": "future-of-smart-wearables"
        }
      }
    ]
  }
}`);

  const schemas = [
    { id: 'blog', name: 'Blog Post', desc: 'Title, Author, Rich Content block' },
    { id: 'seo', name: 'SEO Metatags', desc: 'Heading, Meta Title, Description markers' },
    { id: 'ecom', name: 'Product Highlight', desc: 'Specs, Copy blocks, Benefits indices' }
  ];

  const handleWeaveGenerate = () => {
    setIsGenerating(true);
    setEditorResult("Wriven inking engines at work...");

    // Simulated generation — canned copy per schema + tone
    window.setTimeout(() => {
      const output = SAMPLE_OUTPUTS[activeSchema]?.[fieldTone] ?? SAMPLE_OUTPUTS.blog.Professional;
      setEditorResult(output);

      const formattedTitle = activeSchema === 'blog'
        ? "Unlocking Wellness: The Future of Smart Wearables"
        : activeSchema === 'seo'
        ? "Optimized Health Trackers"
        : "Wriven Smart Air Pro";

      const formattedSlug = activeSchema === 'blog'
        ? "future-of-smart-wearables"
        : activeSchema === 'seo'
        ? "optimized-health-trackers"
        : "wriven-smart-air-pro";

      setJsonResponse(JSON.stringify({
        success: true,
        data: {
          items: [
            {
              id: "entry_771891",
              status: "published",
              contentType: activeSchema === 'blog' ? 'posts' : activeSchema === 'seo' ? 'seo_metadata' : 'products',
              fields: {
                title: formattedTitle,
                slug: formattedSlug,
                generated_content: output
              }
            }
          ]
        }
      }, null, 2));
      setIsGenerating(false);
    }, 900);
  };

  const handleSetSchema = (schemaType: string) => {
    setActiveSchema(schemaType);
    if (schemaType === 'blog') {
      setPromptInput('Write an engaging SEO-optimized intro for a smartwatch article about health tracking.');
    } else if (schemaType === 'seo') {
      setPromptInput('Generate 3 click-worthy title tags and high-converting meta descriptions for a modern headless CMS.');
    } else {
      setPromptInput('Draft a compelling benefits-led description for a lightweight noise-cancelling running headband.');
    }
  };

  return (
    <section className="py-20 relative bg-brand-bg border-b border-brand-border" id="sandbox">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
          <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase">
            Interactive Playground
          </span>
          <h2 className="font-display font-medium tracking-tight text-text-primary text-3xl sm:text-4xl" id="sandbox-headline">
            Draft content and parse instant JSON endpoints
          </h2>
          <p className="text-text-secondary text-sm font-light leading-relaxed">
            Choose a content type, set the tone, refine your prompt, and weave. Sign up to run the real co-writer against your own projects — this preview is simulated.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch" id="sandbox-grid">

          {/* Settings Pane */}
          <div className="lg:col-span-5 bg-brand-surface border border-brand-border-button rounded-xl p-6 flex flex-col justify-between neo-shadow-lg" id="sandbox-setting-pane">
            <div className="space-y-6 text-left">

              {/* Step 1 Schema Selector */}
              <div>
                <label className="block text-sm font-mono font-bold text-text-muted uppercase tracking-wider mb-3">1. Target Content Type</label>
                <div className="grid grid-cols-1 gap-2">
                  {schemas.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSetSchema(s.id)}
                      className={`w-full text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
                        activeSchema === s.id
                        ? 'border-brand-accent bg-brand-surface-soft text-text-primary'
                        : 'border-brand-border hover:border-brand-border-button bg-brand-surface text-text-secondary'
                      }`}
                      id={`schema-btn-${s.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm uppercase text-text-primary">{s.name}</span>
                        <span className="text-sm font-mono text-brand-accent uppercase font-bold">API: {s.id}</span>
                      </div>
                      <span className="block text-sm text-text-secondary mt-1 font-light">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2 Tone Selector */}
              <div>
                <label className="block text-sm font-mono font-bold text-text-muted uppercase tracking-wider mb-2.5">2. Brand Voice Tone</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Professional', 'Casual', 'Creative'].map((tone) => (
                    <button
                      key={tone}
                      onClick={() => setFieldTone(tone)}
                      className={`py-2 text-sm font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
                        fieldTone === tone
                        ? 'bg-brand-accent text-white border-brand-border-button'
                        : 'bg-brand-surface-soft text-text-secondary border-brand-border hover:border-brand-border-button'
                      }`}
                      id={`tone-btn-${tone.toLowerCase()}`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3 Instruction Notes */}
              <div>
                <label className="block text-sm font-mono font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="sandbox-prompt-text">3. AI Copilot Prompt Instructions</label>
                <textarea
                  id="sandbox-prompt-text"
                  rows={3}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Prompt to instruct field weaving..."
                  className="w-full text-sm font-mono rounded-lg bg-brand-surface-soft border border-brand-border p-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent leading-relaxed"
                />
              </div>
            </div>

            <div className="pt-6 border-t border-brand-border mt-6">
              <button
                onClick={handleWeaveGenerate}
                disabled={isGenerating}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider py-4 text-white rounded-lg neo-shadow cursor-pointer transition-all"
                id="sandbox-generate-btn"
              >
                <Sparkles className="w-4 h-4 text-white" />
                {isGenerating ? 'WEAVING DRAFT...' : 'WEAVE WITH WRIVEN AI'}
              </button>
              <p className="pt-3 text-center text-xs font-mono text-text-muted uppercase tracking-wider">
                Simulated preview — the real co-writer runs inside the editor
              </p>
            </div>
          </div>

          {/* Sandbox Outputs */}
          <div className="lg:col-span-7 flex flex-col gap-6" id="sandbox-preview-pane">

            {/* Visual Draft Paper Sheet */}
            <div className="bg-brand-surface border border-brand-border-button rounded-xl p-6 flex flex-col justify-between relative neo-shadow-lg flex-1">
              <div className="flex items-center justify-between border-b border-brand-border pb-3 mb-4">
                <span className="text-sm font-mono uppercase text-text-primary flex items-center gap-2 font-bold">
                  <Layers className="w-4 h-4 text-brand-accent" />
                  ENTRY PREVIEW: generated_draft
                </span>
                <span className="text-sm font-mono text-brand-accent bg-brand-surface-soft border border-brand-border px-1.5 py-0.5 rounded uppercase font-bold">STATE: SIMULATED</span>
              </div>

              <div className="text-left flex-grow">
                <div className="h-full overflow-auto rounded-lg bg-brand-surface-soft/80 p-4 border border-brand-border text-sm font-mono text-text-primary leading-relaxed min-h-[160px] max-h-[220px]">
                  {isGenerating ? (
                    <div className="space-y-3">
                      <div className="h-2.5 w-1/2 bg-text-muted/15 rounded animate-pulse" />
                      <div className="h-2.5 w-3/4 bg-text-muted/15 rounded animate-pulse" />
                      <div className="h-2.5 w-full bg-text-muted/15 rounded animate-pulse" />
                      <div className="h-2.5 w-5/6 bg-text-muted/15 rounded animate-pulse" />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap font-sans text-sm py-1 leading-relaxed text-text-primary">{editorResult}</p>
                  )}
                </div>
              </div>
            </div>

            {/* API Log Ledger Section */}
            <div className="bg-brand-surface border border-brand-border-button rounded-xl p-5 relative overflow-hidden h-[200px] text-left neo-shadow">
              <div className="absolute top-4 right-4 flex gap-2 select-none">
                <span className="inline-flex items-center gap-1 text-sm font-mono font-bold tracking-wider bg-brand-surface-soft text-brand-accent border border-brand-border px-2 py-1 rounded">
                  <Code className="w-3 h-3" />
                  GET /v1/projects/:id/content/:apiId
                </span>
              </div>

              <span className="block text-sm font-mono text-text-muted mb-2 uppercase tracking-widest font-bold">DELIVERY API RESPONSE (JSON)</span>
              <div className="h-[120px] overflow-auto text-sm font-mono rounded bg-brand-surface-soft p-3 border border-brand-border" id="json-scroll">
                <pre className="whitespace-pre-wrap text-text-primary">{jsonResponse}</pre>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
