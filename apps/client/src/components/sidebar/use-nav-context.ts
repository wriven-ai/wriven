'use client';

import { useParams, usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useWorkspaceProjects } from '@/hooks/use-workspace-projects';
import type { NavContext, NavEntityRef } from './nav.types';
import { useCan } from './use-can';

const toRef = (e: { id: string; name: string; slug: string }): NavEntityRef => ({
  id: e.id,
  name: e.name,
  slug: e.slug,
});

/**
 * THE SEAM. Assembles the single `NavContext` the brain consumes.
 *
 * URL is the source of truth: workspace/project come from the route slugs.
 * Workspaces come from the auth session (small, known at login); projects are
 * server state, loaded on demand via {@link useWorkspaceProjects}. If we ever
 * change the route shape or data source, this is the ONE file that changes —
 * builders and the renderer never learn where context comes from.
 */
export function useNavContext(): NavContext {
  const pathname = usePathname();
  const params = useParams<{ wsSlug?: string; projSlug?: string }>();
  const can = useCan();
  const workspaces = useAuthStore((s) => s.workspaces);
  const { workspace, projects } = useWorkspaceProjects();

  return useMemo<NavContext>(() => {
    const wsSlug = params.wsSlug;
    const projSlug = params.projSlug;

    const project = projSlug
      ? (projects.find((p) => p.slug === projSlug) ?? null)
      : null;

    // Feature = the path segment immediately after the project slug.
    let feature: string | undefined;
    if (projSlug) {
      const segs = pathname.split('/').filter(Boolean); // ["w", ws, "p", proj, feat?]
      const projIdx = segs.indexOf(projSlug);
      feature = projIdx >= 0 ? segs[projIdx + 1] : undefined;
    }

    return {
      pathname,
      params: { wsSlug, projSlug, feature },
      can,
      data: {
        workspace: workspace ? toRef(workspace) : null,
        project: project ? toRef(project) : null,
        workspaces: workspaces.map(toRef),
        projects: projects.map(toRef),
      },
    };
  }, [pathname, params.wsSlug, params.projSlug, can, workspace, workspaces, projects]);
}
