'use client';

import React, { useRef, useState } from 'react';
import { Sparkles, Layers, Code } from 'lucide-react';

/**
 * Simulated playground. The real AI co-writer requires an account and project
 * context (it runs through the gateway against the ai-service), so this demo
 * produces canned output client-side — clearly labeled as a simulation.
 * Each schema + tone pair holds a pool of variants that rotate per click so
 * repeat generations feel dynamic.
 */
const SAMPLE_OUTPUTS: Record<string, Record<string, string[]>> = {
  blog: {
    Professional: [
      'Wearables have quietly moved from step counters to genuine health companions. This guide looks at what modern sensors actually measure, which metrics matter, and how to choose a device that fits your routine.',
      'Heart-rate variability, blood oxygen, sleep staging — the modern smartwatch tracks a clinic’s worth of vitals from your wrist. Here is how to read that data without a medical degree, and which numbers deserve your attention.',
      'Health tracking has matured from novelty to necessity. This breakdown covers the sensors inside today’s wearables, the science behind their readings, and the practical questions to ask before you buy.',
      'A decade ago, wearables counted steps. Today they flag irregular heart rhythms and estimate recovery. We looked at what current devices can genuinely tell you about your health — and where the marketing outruns the medicine.',
      'Choosing a health wearable is now an exercise in priorities: battery life against accuracy, ecosystem against openness. This guide sorts the specs that matter from the ones that only sound impressive.',
    ],
    Casual: [
      "Let's be honest — most of us bought a smartwatch for the notifications and stayed for the health tracking. Here's what all those heart-rate charts actually tell you (and what they don't).",
      'Your watch knows you slept badly before you do. Weird? A little. Useful? Very. Here’s a plain-English tour of the health data your wrist has been quietly collecting.',
      'Sleep scores, stress meters, “readiness” percentages — that’s a lot of numbers for a device that started life as a tiny phone. Let’s figure out which ones are actually worth checking.',
      "I glanced at my heart rate on a hike and realized my watch had been paying closer attention to my health than I had. Here's what all that wrist data means once you strip away the jargon.",
      'Smartwatches have become that friend who notices everything — every skipped workout, every restless night. Here’s how to use all that nosy data without obsessing over it.',
    ],
    Creative: [
      'On your wrist sits a small, patient witness: every heartbeat logged, every sleepless night noted. The story of modern wearables is the story of listening to that witness.',
      'It counted the steps you took on the hardest day of the year. It noticed the night you never really slept. This is the quiet autobiography your smartwatch keeps — and how to read it.',
      'A pulse, measured ten thousand times a day, becomes a kind of diary. Your watch does not just tell time anymore; it tells you.',
      'Every beat of the heart, logged. Every rise and fall of sleep, charted. Somewhere between the step counter and the ECG, the wearable became a biographer.',
      'There is a historian on your wrist. It remembers the morning runs and the midnight worries alike — a small machine keeping score of a life in progress.',
    ],
  },
  seo: {
    Professional: [
      'Title: "Headless CMS in 2026: A Practical Guide" — Meta: "How a headless CMS separates content from presentation, why AI-assisted drafting changes editorial workflows, and what to check before you commit."',
      'Title: "What Is a Headless CMS? Architecture, Benefits, Trade-offs" — Meta: "A clear-eyed look at headless content management: API-first delivery, multi-channel publishing, and the costs nobody puts on the landing page."',
      'Title: "Headless vs Traditional CMS: Which Fits Your Stack?" — Meta: "Compare editing experience, developer flexibility, and total cost of ownership across headless and monolithic platforms before you migrate."',
      'Title: "The Engineering Case for Headless Content" — Meta: "Why product teams move content to the API layer: delivery speed, omnichannel reach, and a cleaner split between editors and engineers."',
      'Title: "Choosing a Headless CMS: A 9-Point Checklist" — Meta: "Content modeling, versioning, permissions, delivery APIs — the criteria that separate a scalable CMS from a demo-day demo."',
    ],
    Casual: [
      'Title: "So You Are Eyeing a Headless CMS" — Meta: "The no-jargon rundown of headless CMS: what it is, why developers love it, and how AI drafting fits in."',
      'Title: "Headless CMS, Explained Like You Are Busy" — Meta: "Five minutes on what headless actually means, whether your team needs it, and what it really costs to switch."',
      'Title: "Your Content, Everywhere: A Headless Primer" — Meta: "Same content, any screen — site, app, watch. Here’s how headless setups pull that off without the buzzword migraine."',
      'Title: "Headless CMS: Worth the Hype?" — Meta: "An honest take on going headless — the wins, the gotchas, and the moment you know it is right for you."',
      'Title: "Stop Rebuilding Your Blog Every Redesign" — Meta: "Content lives once and publishes anywhere. How a headless CMS ends the great content-migration ritual."',
    ],
    Creative: [
      'Title: "Your Content, Unshackled" — Meta: "Content that lives apart from its presentation. A short field guide to headless publishing and the AI that drafts alongside you."',
      'Title: "The CMS With No Face" — Meta: "Headless means your content wears no single costume — it dresses for web, app, and whatever ships next."',
      'Title: "Write Once, Roam Everywhere" — Meta: "Headless content is a passport: drafted once at the desk, fluent on every screen it meets."',
      'Title: "Content Without a Cage" — Meta: "Why the best content has no fixed address — a small manifesto on API-first publishing."',
      'Title: "Lose the Head, Keep the Content" — Meta: "A playful case for headless publishing: your words, freed from any single template."',
    ],
  },
  ecom: {
    Professional: [
      'Lightweight and sweat-resistant, this running headband pairs active noise cancellation with a secure fit — engineered for long training sessions where music matters and distractions do not.',
      'Built for distance. The moisture-wicking knit holds its shape across seasons of training, while adaptive noise cancellation walks the line between awareness and immersion.',
      'A training-grade audio headband: breathable knit exterior, IPX5 sweat resistance, and tunable noise cancellation tuned for road runners and gym floors alike.',
      'A single-piece design eliminates cable drag and earbud dropout. Dual-driver audio with ambient passthrough keeps outdoor sessions situationally aware.',
      'From warm-up to cooldown: the compression-fit fabric stays put at race pace, and the low-profile control module disappears under a hat or hood.',
    ],
    Casual: [
      "Runs better with music, no earbuds falling out mid-sprint. Noise cancellation blocks the gym noise; the fabric stays put even when you don't.",
      'Earbuds pop out, headphones get sweaty, but a soft headband with speakers inside? That just works. Press play and forget it is there.',
      'Rain, sweat, that one brutal hill repeat — none of it bothers this thing. Music in, gym chaos out.',
      'It is a headband. It is also your headphones. Somehow it is also the most comfortable thing you will wear on a run. Welcome to the good part of the future.',
      'No wires to snag, no buds to re-seat, no “reconnecting…” mid-song. Just a comfy band, your playlist, and the road.',
    ],
    Creative: [
      'The city hum fades. Your playlist takes its place. Built for the runner who moves to a beat, this headband carries sound like a second heartbeat.',
      'Dawn miles, wet pavement, the first song that finds your rhythm. The band holds the music close and lets the world blur past.',
      'Some runners chase silence. You chase bass lines. This is sound woven into fabric — a rhythm section you wear.',
      'Mile three. The city dissolves into drums. Somewhere under that soft knit, a soundtrack is keeping pace with your pulse.',
      'It does not cancel the world so much as remix it — your breath, your steps, your song, arranged into something like flying.',
    ],
  },
};

/** Entry metadata variants (id, title, slug) per schema — indexed alongside outputs. */
const SAMPLE_ENTRIES: Record<string, { id: string; title: string; slug: string }[]> = {
  blog: [
    { id: 'entry_771891', title: 'Unlocking Wellness: The Future of Smart Wearables', slug: 'future-of-smart-wearables' },
    { id: 'entry_528304', title: 'What Your Smartwatch Knows About You', slug: 'what-your-smartwatch-knows' },
    { id: 'entry_339412', title: 'Reading Your Resting Heart Rate the Right Way', slug: 'resting-heart-rate-guide' },
    { id: 'entry_684127', title: 'The Wearable Health Metrics Worth Watching', slug: 'wearable-metrics-worth-watching' },
    { id: 'entry_905318', title: 'From Step Counter to Health Companion', slug: 'step-counter-to-health-companion' },
  ],
  seo: [
    { id: 'entry_771891', title: 'Optimized Health Trackers', slug: 'optimized-health-trackers' },
    { id: 'entry_442090', title: 'Headless CMS in 2026', slug: 'headless-cms-2026' },
    { id: 'entry_217645', title: 'What Is a Headless CMS', slug: 'what-is-headless-cms' },
    { id: 'entry_873512', title: 'Headless vs Traditional CMS', slug: 'headless-vs-traditional-cms' },
    { id: 'entry_590836', title: 'Choose a Headless CMS', slug: 'choose-headless-cms-checklist' },
  ],
  ecom: [
    { id: 'entry_771891', title: 'Wriven Smart Air Pro', slug: 'wriven-smart-air-pro' },
    { id: 'entry_318264', title: 'Wriven SoundBand Flow', slug: 'wriven-soundband-flow' },
    { id: 'entry_726451', title: 'Wriven PulseWrap Elite', slug: 'wriven-pulsewrap-elite' },
    { id: 'entry_184937', title: 'Wriven Cadence One', slug: 'wriven-cadence-one' },
    { id: 'entry_630582', title: 'Wriven Tempo Band', slug: 'wriven-tempo-band' },
  ],
};

export default function SandboxPlayground() {
  const rotationRef = useRef<Record<string, number>>({});
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

  /** Advance the per schema+tone rotation counter so repeats cycle through variants. */
  const nextVariantIndex = (key: string, total: number) => {
    const counts = rotationRef.current;
    const idx = (counts[key] ?? 0) % total;
    counts[key] = idx + 1;
    return idx;
  };

  const handleWeaveGenerate = () => {
    setIsGenerating(true);
    setEditorResult("Wriven inking engines at work...");

    // Simulated generation — rotating canned copy per schema + tone
    window.setTimeout(() => {
      const outputs = SAMPLE_OUTPUTS[activeSchema]?.[fieldTone] ?? SAMPLE_OUTPUTS.blog.Professional;
      const idx = nextVariantIndex(`${activeSchema}:${fieldTone}`, outputs.length);
      const output = outputs[idx] ?? outputs[0];
      setEditorResult(output);

      const entry = SAMPLE_ENTRIES[activeSchema]?.[idx] ?? SAMPLE_ENTRIES.blog[0];

      setJsonResponse(JSON.stringify({
        success: true,
        data: {
          items: [
            {
              id: entry.id,
              status: "published",
              contentType: activeSchema === 'blog' ? 'posts' : activeSchema === 'seo' ? 'seo_metadata' : 'products',
              fields: {
                title: entry.title,
                slug: entry.slug,
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
            <div className="bg-brand-surface border border-brand-border-button rounded-xl p-5 flex flex-col relative neo-shadow-lg">
              <div className="flex items-center justify-between border-b border-brand-border pb-3 mb-4">
                <span className="text-sm font-mono uppercase text-text-primary flex items-center gap-2 font-bold">
                  <Layers className="w-4 h-4 text-brand-accent" />
                  ENTRY PREVIEW: generated_draft
                </span>
                <span className="text-sm font-mono text-brand-accent bg-brand-surface-soft border border-brand-border px-1.5 py-0.5 rounded uppercase font-bold">STATE: SIMULATED</span>
              </div>

              <div className="text-left flex-grow">
                <div className="h-full overflow-auto rounded-lg bg-brand-surface-soft/80 p-4 border border-brand-border text-sm font-mono text-text-primary leading-relaxed min-h-[110px] max-h-[150px]">
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
            <div className="bg-brand-surface border border-brand-border-button rounded-xl p-5 relative overflow-hidden h-[340px] flex flex-col text-left neo-shadow">
              <div className="absolute top-4 right-4 flex gap-2 select-none">
                <span className="inline-flex items-center gap-1 text-sm font-mono font-bold tracking-wider bg-brand-surface-soft text-brand-accent border border-brand-border px-2 py-1 rounded">
                  <Code className="w-3 h-3" />
                  GET /v1/projects/:id/content/:apiId
                </span>
              </div>

              <span className="block text-sm font-mono text-text-muted mb-3 uppercase tracking-widest font-bold">DELIVERY API RESPONSE (JSON)</span>
              <div className="flex-1 min-h-0 overflow-auto text-sm font-mono rounded bg-brand-surface-soft p-3 border border-brand-border" id="json-scroll">
                <pre className="whitespace-pre-wrap text-text-primary">{jsonResponse}</pre>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
