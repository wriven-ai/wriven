import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Technical notes on headless architecture, AI-assisted writing workflows, and content delivery from the Wriven journal.',
  alternates: { canonical: '/blog' },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
