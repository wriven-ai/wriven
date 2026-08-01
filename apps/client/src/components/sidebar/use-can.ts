'use client';

import { useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Permission, effectivePermissions } from '@wriven/contracts/rbac';
import { useAuthStore } from '@/stores/auth';

/**
 * RBAC access gate — the single seam the nav brain calls to decide visibility.
 *
 * Resolves the caller's effective permission set from the active workspace +
 * project **role** and tests against it. Uses the identical
 * `effectivePermissions` cascade the auth-service resolver + gateway guard use
 * (shared from `@wriven/contracts/rbac`), so a workspace owner/admin with no
 * `project_members` row still holds every project permission.
 *
 * Roles are derived from the **URL slug** (the source of truth), not the store
 * id mirror — the mirror is set by a layout `useEffect` (after paint), so
 * reading it would give a one-frame stale/wrong permission set. The session
 * `workspaces`/`projects` arrays already carry `.role`, so resolving by slug is
 * synchronous and complete on the first render. (The store id mirror remains
 * for the API client's `X-Workspace-Id` / `X-Project-Id` headers — a
 * fetch-time concern, not a render-time one.)
 */
export type Can = (permission: Permission) => boolean;

export function useCan(): Can {
  const { wsSlug, projSlug } = useParams<{ wsSlug?: string; projSlug?: string }>();
  const workspaces = useAuthStore((s) => s.workspaces);
  const projects = useAuthStore((s) => s.projects);

  const perms = useMemo(() => {
    const wsRole = wsSlug
      ? (workspaces.find((w) => w.slug === wsSlug)?.role ?? null)
      : null;
    const projRole = projSlug
      ? (projects.find((p) => p.slug === projSlug)?.role ?? null)
      : null;
    return effectivePermissions(wsRole, projRole);
  }, [workspaces, projects, wsSlug, projSlug]);

  return useCallback<Can>((permission) => perms.has(permission), [perms]);
}
