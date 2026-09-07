/**
 * Editorial block model for blog post bodies. Rendered server-side by
 * `app/blog/[slug]/page.tsx` — no markdown parser needed.
 */
export type BlogBlock =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; items: { lead?: string; text: string }[] }
  | { type: 'code'; text: string };

export interface BlogPost {
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  date: string;
  readingTime: string;
  coverImage: string;
  authorName: string;
  authorImage: string;
  body: BlogBlock[];
}

export const mockPosts: BlogPost[] = [
  {
    title: 'The Architecture of Headless Content Injections',
    slug: 'headless-content-injections',
    category: 'Architecture',
    excerpt:
      'Dismantling the constraints of monolithic layout definitions. Learn how we feed raw content schemas directly into lightweight React layers at low latency, and why inline prompt engineering is changing the speed of digital media production.',
    date: 'June 08, 2026',
    readingTime: '6 min read',
    coverImage: 'https://picsum.photos/seed/injection/800/500',
    authorName: 'Anowar Hosen',
    authorImage: '/anowar-dp_compressed.jpg',
    body: [
      {
        type: 'p',
        text: 'As content systems evolve, the pressure on developers and authors increases. Standard content workflows demand absolute synchronization across codebases, media catalogs, and LLM workspaces. In this post, we break down the architecture that lets Wriven treat a content schema as a living contract between the editor and the delivery layer.',
      },
      {
        type: 'p',
        text: 'A headless system architecture separated the developer’s React bundle from the backend’s SQL database. It solved delivery speed, but created a friction-filled workspace experience for editors. Authors found themselves drafting titles inside one AI chat, translating strings in another, and copy-pasting blocks into plain textareas — hoping headers would not break.',
      },
      {
        type: 'quote',
        text: 'By placing generative models directly into the field input controls of structured content matrices, Wriven weaves human ideas and machine translations on one collaborative dashboard.',
      },
      { type: 'h3', text: 'Expanding primitive types into smart assets' },
      {
        type: 'p',
        text: 'In standard headless CMS engines, a field type is declared as Short_Text, Rich_Markdown, or Media_Library. Wriven takes this baseline configuration and extends it with server-side AI handlers that understand the schema around each field.',
      },
      {
        type: 'list',
        items: [
          {
            lead: 'Context-Aware fields:',
            text: 'The in-editor prompt sees the overall schema layout. If a user generates a blog description, the AI contextually reads the Title to maintain semantic alignment.',
          },
          {
            lead: 'Pre-Populated SEO metatags:',
            text: 'Auto-generate keywords, localized translations, and click-worthy titles for search ranking directly from the entry being edited.',
          },
          {
            lead: 'Native Asset Generation:',
            text: 'Build abstract cover imagery and high-contrast visuals without invoking external AI interfaces or leaving the editor.',
          },
        ],
      },
      {
        type: 'p',
        text: 'The result is an injection pipeline: schema in, validated structured JSON out. Because every generation runs against the declared content model, the delivery API never has to guess what a field means — it just serves it at the edge.',
      },
    ],
  },
  {
    title: 'Designing Minimalist Interfaces for Information Density',
    slug: 'minimalist-interfaces',
    category: 'Design',
    excerpt:
      'Why high-contrast editorial layouts outperform cluttered purple grids. Exploring Swiss print aesthetics, offset shadows, and calm color rules.',
    date: 'May 24, 2026',
    readingTime: '4 min read',
    coverImage: 'https://picsum.photos/seed/density/600/400',
    authorName: 'Anowar Hosen',
    authorImage: '/anowar-dp_compressed.jpg',
    body: [
      {
        type: 'p',
        text: 'There is a quiet war in interface design between showing everything and showing what matters. Headless CMS dashboards are usually the first casualty: twenty panels, eleven accent colors, and a sidebar that competes with the content it is supposed to manage.',
      },
      {
        type: 'p',
        text: 'When we drew the first Wriven editor screens, we borrowed from Swiss print design instead of SaaS dashboards: a strict typographic scale, generous whitespace, and exactly one accent color reserved for actions. Density came from hierarchy, not from shrinking everything.',
      },
      {
        type: 'quote',
        text: 'A calm interface is not an empty one — it is one where every pixel of attention is budgeted.',
      },
      { type: 'h3', text: 'Rules we actually shipped' },
      {
        type: 'list',
        items: [
          {
            lead: 'One accent color:',
            text: 'Interactive elements get the accent; everything else lives on a paper-toned neutral ramp. If everything is highlighted, nothing is.',
          },
          {
            lead: 'Monospace for data:',
            text: 'Dates, slugs, quotas, and IDs render in a fixed-width face. Numbers align, scanning gets faster, and the UI quietly signals what is machine-facing.',
          },
          {
            lead: 'Shadows with restraint:',
            text: 'Soft offset shadows lift interactive cards only. Static content sits flat on the surface — depth becomes a navigational cue, not decoration.',
          },
        ],
      },
      {
        type: 'p',
        text: 'The payoff showed up in usability sessions: editors found the AI panel without a tour, and developers read entry JSON previews without leaning in. Minimalism, it turns out, is an information-density strategy.',
      },
    ],
  },
  {
    title: 'Optimizing JSON Feed Pipelines Over Vercel Edge Serverless',
    slug: 'optimizing-json-pipelines',
    category: 'Engineering',
    excerpt:
      'Deep dives into stateful API caches, query optimizations, and token security boundaries. How to deliver markdown content streams globally under 12ms.',
    date: 'May 11, 2026',
    readingTime: '8 min read',
    coverImage: 'https://picsum.photos/seed/pipeline/600/400',
    authorName: 'Anowar Hosen',
    authorImage: '/anowar-dp_compressed.jpg',
    body: [
      {
        type: 'p',
        text: 'A delivery API has one job: hand a display app the exact JSON it asked for, from wherever the user is, before the spinner finishes drawing. Everything else — authoring, AI, media — happens upstream. That single-mindedness is what makes edge delivery tractable.',
      },
      {
        type: 'p',
        text: 'This post walks the path a published entry takes in Wriven: from a Postgres row in the core service, through the gateway, into a cache layer, and out as a signed, cacheable response at the edge.',
      },
      { type: 'h3', text: 'Where the milliseconds actually go' },
      {
        type: 'list',
        items: [
          {
            lead: 'Serialization:',
            text: 'Rendering entry JSON is cheap; doing it per request is not. Cache the serialized payload, not the database rows, and invalidation stays one write wide.',
          },
          {
            lead: 'Cold starts:',
            text: 'Serverless regions pay a boot tax on first hit. Warming the serialization path and keeping route handlers lean turns the worst case into the average case.',
          },
          {
            lead: 'Auth boundaries:',
            text: 'The delivery API keys never see workspace JWTs. Scope validation happens once at token issue time, so edge responses skip the entire auth round trip.',
          },
        ],
      },
      {
        type: 'code',
        text: 'GET /v1/delivery/projects/{projectId}/entries?slug=hello\n→ cache: HIT  x-edge-region: sin1  time: 11.6ms',
      },
      {
        type: 'p',
        text: 'The lesson from instrumenting this pipeline: optimize the architecture first — cache placement, payload shape, invalidation width — and only then micro-tune the code. Most latency lives in the design, not the function bodies.',
      },
    ],
  },
  {
    title: 'The Copilot Manifest: Bridging AI Drafts and Editorial Craft',
    slug: 'copilot-manifest',
    category: 'Workflows',
    excerpt:
      'An investigation on how content producers collaborate with inline algorithms without sacrificing brand voice integrity or premium editorial cadence.',
    date: 'April 29, 2026',
    readingTime: '5 min read',
    coverImage: 'https://picsum.photos/seed/copilot/600/400',
    authorName: 'Anowar Hosen',
    authorImage: '/anowar-dp_compressed.jpg',
    body: [
      {
        type: 'p',
        text: 'Every team adopting an AI writing assistant hits the same wall around week two: the drafts are fluent, fast, and somehow wrong. Not factually wrong — tonally wrong. They read like everyone else’s internet.',
      },
      {
        type: 'p',
        text: 'The failure is structural, not model-level. An assistant that sees only the field it is filling will optimize for plausible text. An assistant that sees the entry’s schema, its siblings, and the project’s voice profile can optimize for *this* publication instead.',
      },
      {
        type: 'quote',
        text: 'Brand voice is not a prompt preamble — it is context engineering: what the model is allowed to see before it writes a single word.',
      },
      { type: 'h3', text: 'Principles for inline collaboration' },
      {
        type: 'list',
        items: [
          {
            lead: 'Draft beside, never over:',
            text: 'AI output lands in a diff the editor approves or rejects. The human cursor stays sovereign; suggestions never silently replace typed text.',
          },
          {
            lead: 'Voice is a project setting:',
            text: 'Tone, vocabulary, and banned phrases live with the project, not in each author’s private chat history. New teammates inherit the house style on day one.',
          },
          {
            lead: 'Quota honesty:',
            text: 'Every generation is metered and visible. When the team knows what a draft costs, the copilot becomes a power tool instead of a slot machine.',
          },
        ],
      },
      {
        type: 'p',
        text: 'The editors who get the most out of Wriven’s copilot treat it like a very fast junior colleague: give it context, review everything, keep the final word. That division of labor is the whole manifest.',
      },
    ],
  },
];
