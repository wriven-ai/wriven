import { Analytics } from '@vercel/analytics/next';
import { cn } from '@/lib/utils';
import { Manrope } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import './global.css';
import { Providers } from './providers';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#060417' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL('https://www.wriven.tech'),
  title: {
    default: 'Wriven — AI-Native Headless CMS',
    template: '%s · Wriven',
  },
  description:
    'Wriven is an AI-native headless CMS. Define your content model, draft with a built-in AI co-writer, and publish to any framework through a clean REST delivery API.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Wriven',
    url: 'https://www.wriven.tech',
    title: 'Wriven — AI-Native Headless CMS',
    description:
      'Define your content model, draft with a built-in AI co-writer, and publish to any framework through a clean REST delivery API.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wriven — AI-Native Headless CMS',
    description:
      'AI-native headless CMS with a built-in AI co-writer and a clean REST delivery API.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn('font-sans', manrope.variable)}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
