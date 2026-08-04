import { ShieldAlert } from 'lucide-react';

/**
 * Standalone "no access" card. Shown by route guards when the current role
 * lacks the page's permission (direct navigation / refresh). The backend
 * `PermissionGuard` (→ 403) is the real gate; this is UX so the hit degrades
 * gracefully instead of surfacing the 403.
 */
export function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <ShieldAlert className="w-8 h-8 text-status-error" />
      <p className="font-mono text-sm font-bold text-text-secondary">
        You don&apos;t have access to this page
      </p>
      <p className="font-mono text-xs text-text-muted">
        Ask a workspace owner or project admin to update your role.
      </p>
    </div>
  );
}
