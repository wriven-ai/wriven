'use client';

import { useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Permission, effectivePermissions } from '@wriven/contracts/rbac';
import { useWorkspaceProjects } from '@/hooks/use-workspace-projects';

/**
 * RBAC access gate — the single seam the nav brain calls to decide visibility.
 *
 * Resolves the caller's effective permission set from the active workspace +
 * project role and tests against it. Uses the identical `effectivePermissions`
 * cascade the auth-service resolver + gateway guard use (shared from
 * `@wriven/contracts/rbac`), so a workspace owner/admin with no
 * `project_members` row still holds every project permission.
 *
 * Roles are resolved the SAME way the nav resolves its data — via
 * {@link useWorkspaceProjects} (which uses `useCurrentWorkspace`): by URL slug
 * on scoped routes (`/w/[wsSlug]/…`) and by the default workspace at the
 * slug-less `/dashboard` home. This is synchronous on the first render (no
 * store-id-mirror race) AND covers `/dashboard` (where there is no slug).
 */
export type Can = (permission: Permission) => boolean;

export function useCan(): Can {
  const { projSlug } = useParams<{ projSlug?: string }>();
  const { workspace, projects } = useWorkspaceProjects();

  const perms = useMemo(() => {
    const wsRole = workspace?.role ?? null;
    const projRole = projSlug
      ? (projects.find((p) => p.slug === projSlug)?.role ?? null)
      : null;
    return effectivePermissions(wsRole, projRole);
  }, [workspace, projects, projSlug]);

  return useCallback<Can>((permission) => perms.has(permission), [perms]);
}
