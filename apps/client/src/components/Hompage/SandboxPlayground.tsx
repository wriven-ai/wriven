'use client';

import React, { useState } from 'react';
import { Sparkles, Layers, Code } from 'lucide-react';

export default function SandboxPlayground() {
  const [activeSchema, setActiveSchema] = useState('blog');
  const [promptInput, setPromptInput] = useState('Write an engaging SEO-optimized intro for a smart smartwatch article about health tracking.');
  const [fieldTone, setFieldTone] = useState('Professional');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editorResult, setEditorResult] = useState(
    "Select a styling, instruction prompts, and click 'Weave with AI' to experience in-editor generation."
  );
  const [jsonResponse, setJsonResponse] = useState(`{
  "status": "draft",
  "id": "entry_771891",
  "contentType": "blog_post",
  "fields": {
    "title": "Unlocking Wellness: The Future of Smart wearables",
    "slug": "future-of-smart-wearables",
    "content": "Click Weave with AI above to generate the full article block."
  }
}`);

  const schemas = [
    { id: 'blog', name: 'Blog Post', desc: 'Title, Author, Rich Content block' },
    { id: 'seo', name: 'SEO Metatags', desc: 'Heading, Meta Title, Description markers' },
    { id: 'ecom', name: 'Product Highlight', desc: 'Specs, Copy blocks, Benefits indices' }
  ];

  const handleWeaveGenerate = async () => {
    setIsGenerating(true);
    setEditorResult("Wriven inking engines at work...");
    
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: promptInput,
          fieldType: activeSchema === 'seo' ? 'SEO Tags' : 'Rich Text Block',
          tone: fieldTone,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setEditorResult(data.text);
        
        const formattedTitle = activeSchema === 'blog' 
          ? "Unlocking Wellness: The Future of Smart wearables" 
          : activeSchema === 'seo' 
          ? "Optimized Health Trackers" 
          : "Wriven Smart Air Pro";
          
        const formattedSlug = activeSchema === 'blog' 
          ? "future-of-smart-wearables" 
          : activeSchema === 'seo' 
          ? "optimized-health-trackers" 
          : "wriven-smart-air-pro";

        setJsonResponse(JSON.stringify({
          status: "published",
          id: "entry_771891",
          contentType: activeSchema === 'blog' ? 'blog_post' : activeSchema === 'seo' ? 'seo_metadata' : 'product_features',
          meta: {
            tone: fieldTone,
            lastWeaved: new Date().toISOString(),
            isFallbackResponse: !!data.isFallback
          },
          fields: {
            title: formattedTitle,
            slug: formattedSlug,
            generated_content: data.text
          }
        }, null, 2));

      } else {
        setEditorResult("Generation failed: " + (data.error || "Please try again."));
      }
    } catch (err) {
      setEditorResult("An error occurred during call. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSetSchema = (schemaType: string) => {
    setActiveSchema(schemaType);
    if (schemaType === 'blog') {
      setPromptInput('Write an engaging SEO-optimized intro for a smart smartwatch article about health tracking.');
    } else if (schemaType === 'seo') {
      setPromptInput('Generate 3 click-worthy title tags and high-converting meta descriptions for a modern headless CMS.');
    } else {
      setPromptInput('Draft a compelling benefits-led description for a lightweight noise-cancelling active running headband.');
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
            Choose a structured schema model, customize the tone of your content, refine your instructional prompts, and weave. Instantly deliver JSON records secure for any API payload.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch" id="sandbox-grid">
          
          {/* Settings Pane */}
          <div className="lg:col-span-5 bg-brand-surface border border-brand-border-button rounded-xl p-6 flex flex-col justify-between neo-shadow-lg" id="sandbox-setting-pane">
            <div className="space-y-6 text-left">
              
              {/* Step 1 Schema Selector */}
              <div>
                <label className="block text-sm font-mono font-bold text-text-muted uppercase tracking-wider mb-3">1. Target Schema Model</label>
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
                        <span className="text-sm font-mono text-brand-accent uppercase font-bold">ID: {s.id}</span>
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
            </div>
          </div>

          {/* Sandbox Outputs */}
          <div className="lg:col-span-7 flex flex-col gap-6" id="sandbox-preview-pane">
            
            {/* Visual Draft Paper Sheet */}
            <div className="bg-brand-surface border border-brand-border-button rounded-xl p-6 flex flex-col justify-between relative neo-shadow-lg flex-1">
              <div className="flex items-center justify-between border-b border-brand-border pb-3 mb-4">
                <span className="text-sm font-mono uppercase text-text-primary flex items-center gap-2 font-bold">
                  <Layers className="w-4 h-4 text-brand-accent" />
                  CMS PREVIEWING SHEET: weaved_draft_content
                </span>
                <span className="text-sm font-mono text-brand-accent bg-brand-surface-soft border border-brand-border px-1.5 py-0.5 rounded uppercase font-bold">STATE: AUTOSAVED</span>
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
                  GET /api/v1/content
                </span>
              </div>
              
              <span className="block text-sm font-mono text-text-muted mb-2 uppercase tracking-widest font-bold">{"// SECURE API RESPONSE (JSON)"}</span>
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
