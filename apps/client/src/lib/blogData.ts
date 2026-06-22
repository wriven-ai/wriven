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
    authorName: 'Marcus Weave',
    authorImage: 'https://picsum.photos/seed/marcus/100/100',
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
    authorName: 'Elena Rostova',
    authorImage: 'https://picsum.photos/seed/elena/100/100',
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
    authorName: 'Sophia Wright',
    authorImage: 'https://picsum.photos/seed/sophia/100/100',
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
    authorName: 'Marcus Weave',
    authorImage: 'https://picsum.photos/seed/marcus/100/100',
  },
];
