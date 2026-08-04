'use client';

import { ReactNode } from 'react';
import { useSyncWorkspaceFromUrl } from '@/hooks/use-scope';

/**
 * Workspace scope boundary. Resolves the `wsSlug` segment to a workspace and
 * mirrors it into the store (for API headers). 404s on an unknown slug.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  useSyncWorkspaceFromUrl();
  return <>{children}</>;
}
