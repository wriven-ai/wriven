import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Wriven is built by one developer — the editor, the AI drafting pipeline, and the delivery API, end to end.',
  alternates: { canonical: '/about' },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
