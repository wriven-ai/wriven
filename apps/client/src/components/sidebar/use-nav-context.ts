'use client';

import { useParams, usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { NavContext, NavEntityRef } from './nav.types';
import { useCan } from './use-can';

/**
 * THE SEAM. Assembles the single `NavContext` the brain consumes.
 *
 * URL is the source of truth: workspace/project come from the route slugs and
 * are resolved to entities via the loaded session. If we ever change the route
 * shape (or move slugs elsewhere), this is the ONE file that changes — builders
 * and the renderer never learn where context comes from.
 */
export function useNavContext(): NavContext {
  const pathname = usePathname();
  const params = useParams<{ wsSlug?: string; projSlug?: string }>();
  const can = useCan();
  const { workspaces, projects } = useAuth();

  return useMemo<NavContext>(() => {
    const wsSlug = params.wsSlug;
    const projSlug = params.projSlug;

    const workspace = wsSlug
      ? (workspaces.find((w) => w.slug === wsSlug) ?? null)
      : null;

    // Projects within the resolved workspace.
    const wsProjects = workspace
      ? projects.filter((p) => p.workspaceId === workspace.id)
      : [];

    const project = projSlug
      ? (wsProjects.find((p) => p.slug === projSlug) ?? null)
      : null;

    // Feature = the path segment immediately after the project slug.
    let feature: string | undefined;
    if (projSlug) {
      const segs = pathname.split('/').filter(Boolean); // ["w", ws, "p", proj, feat?]
      const projIdx = segs.indexOf(projSlug);
      feature = projIdx >= 0 ? segs[projIdx + 1] : undefined;
    }

    const toRef = (e: {
      id: string;
      name: string;
      slug: string;
    }): NavEntityRef => ({ id: e.id, name: e.name, slug: e.slug });

    return {
      pathname,
      params: { wsSlug, projSlug, feature },
      can,
      data: {
        workspace: workspace ? toRef(workspace) : null,
        project: project ? toRef(project) : null,
        workspaces: workspaces.map(toRef),
        projects: wsProjects.map(toRef),
      },
    };
  }, [pathname, params.wsSlug, params.projSlug, can, workspaces, projects]);
}
