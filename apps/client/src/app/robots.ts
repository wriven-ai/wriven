import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard',
          '/w/',
          '/workspaces',
          '/profile',
          '/billing',
          '/invite/',
          '/auth/',
        ],
      },
    ],
    sitemap: 'https://www.wriven.tech/sitemap.xml',
  };
}
