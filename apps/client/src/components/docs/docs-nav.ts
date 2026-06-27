import {
  BookOpen,
  Boxes,
  Database,
  Eye,
  Filter,
  KeyRound,
  Rocket,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface DocLink {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export interface DocGroup {
  label: string;
  items: DocLink[];
}

/** Ordered docs navigation — drives the sidebar and is the single source of order. */
export const DOCS_NAV: DocGroup[] = [
  {
    label: 'Getting Started',
    items: [
      { title: 'Introduction', href: '/docs', icon: BookOpen },
      { title: 'Quickstart', href: '/docs/quickstart', icon: Rocket },
      { title: 'Authentication', href: '/docs/authentication', icon: KeyRound },
    ],
  },
  {
    label: 'Content Delivery',
    items: [
      { title: 'Delivery API', href: '/docs/delivery-api', icon: Database },
      { title: 'Querying & Filtering', href: '/docs/querying', icon: Filter },
      { title: 'Preview & Drafts', href: '/docs/preview', icon: Eye },
    ],
  },
  {
    label: 'Guides',
    items: [{ title: 'Next.js', href: '/docs/nextjs', icon: Boxes }],
  },
];
