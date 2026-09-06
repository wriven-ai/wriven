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
  // No lastmod for static/doc routes — no reliable modification source;
  // omitting beats lying (Google discounts inaccurate lastmod).
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE },
    { url: `${SITE}/pricing` },
    { url: `${SITE}/about` },
    { url: `${SITE}/blog` },
    { url: `${SITE}/contact` },
    { url: `${SITE}/docs` },
  ];

  const docRoutes: MetadataRoute.Sitemap = DOC_SLUGS.map((slug) => ({
    url: `${SITE}/docs/${slug}`,
  }));

  const blogRoutes: MetadataRoute.Sitemap = mockPosts.map((post) => ({
    url: `${SITE}/blog/${post.slug}`,
    lastModified: new Date(post.date),
  }));

  return [...staticRoutes, ...docRoutes, ...blogRoutes];
}
