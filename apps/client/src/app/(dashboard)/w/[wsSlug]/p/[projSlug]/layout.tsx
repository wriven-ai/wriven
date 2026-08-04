'use client';

import { ReactNode } from 'react';
import { useSyncProjectFromUrl } from '@/hooks/use-scope';

/**
 * Project scope boundary. Resolves the `projSlug` segment to a project within
 * the active workspace and mirrors it into the store. 404s on an unknown slug.
 */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  useSyncProjectFromUrl();
  return <>{children}</>;
}
