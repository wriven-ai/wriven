import type { MetadataRoute } from 'next';
import { mockPosts } from '@/lib/blogData';

const SITE = 'https://www.wriven.tech';

const DOC_SLUGS = [
  'quickstart',
  'authentication',
  'content-modeling',
  'entries',
  'rich-text',
  'media',
  'querying',
  'caching',
  'preview',
  'delivery-api',
  'sdk',
  'nextjs',
  'webhooks',
  'rate-limits',
  'errors',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/pricing`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/blog`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE}/contact`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE}/docs`, changeFrequency: 'weekly', priority: 0.8 },
  ];

  const docRoutes: MetadataRoute.Sitemap = DOC_SLUGS.map((slug) => ({
    url: `${SITE}/docs/${slug}`,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const blogRoutes: MetadataRoute.Sitemap = mockPosts.map((post) => ({
    url: `${SITE}/blog/${post.slug}`,
    lastModified: now,
    changeFrequency: 'yearly',
    priority: 0.5,
  }));

  return [...staticRoutes, ...docRoutes, ...blogRoutes];
}
