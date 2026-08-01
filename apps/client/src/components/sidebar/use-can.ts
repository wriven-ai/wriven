'use client';

import { useCallback } from 'react';

/**
 * RBAC access gate — the single seam the nav brain calls to decide visibility.
 *
 * STUB: returns `true` for everything today. When the RBAC backend lands,
 * fill the body here (read role from the store / session, evaluate against the
 * permission + scope). The signature is intentionally stable so no builder or
 * renderer changes when this becomes real.
 *
 * `WorkspaceView.role` / `ProjectView.role` already exist on the session types
 * and are the natural input for the real implementation.
 */
export type Can = (permission: string, scope?: Record<string, string>) => boolean;

export function useCan(): Can {
  return useCallback<Can>((_permission, _scope) => {
    // TODO(rbac): evaluate permission against the current role + scope.
    return true;
  }, []);
}
