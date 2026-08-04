import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Database,
  Eye,
  FileText,
  Filter,
  Gauge,
  Image,
  KeyRound,
  Package,
  Rocket,
  Server,
  Shapes,
  Type,
  Webhook,
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
      { title: 'Content Modeling', href: '/docs/content-modeling', icon: Shapes },
    ],
  },
  {
    label: 'Content Delivery',
    items: [
      { title: 'Delivery API', href: '/docs/delivery-api', icon: Database },
      { title: 'Querying & Filtering', href: '/docs/querying', icon: Filter },
      { title: 'Content & Entries', href: '/docs/entries', icon: FileText },
      { title: 'Rich Text', href: '/docs/rich-text', icon: Type },
      { title: 'Media & Images', href: '/docs/media', icon: Image },
      { title: 'Preview & Drafts', href: '/docs/preview', icon: Eye },
    ],
  },
  {
    label: 'Reference',
    items: [
      { title: 'Errors', href: '/docs/errors', icon: AlertTriangle },
      { title: 'Rate Limits & Usage', href: '/docs/rate-limits', icon: Gauge },
      { title: 'Caching', href: '/docs/caching', icon: Server },
    ],
  },
  {
    label: 'Guides',
    items: [
      { title: 'SDK & Client Libraries', href: '/docs/sdk', icon: Package },
      { title: 'Next.js', href: '/docs/nextjs', icon: Boxes },
      { title: 'Webhooks', href: '/docs/webhooks', icon: Webhook },
    ],
  },
];
