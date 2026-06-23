import type { AuthResult, ProjectView, SessionView, WorkspaceView } from './types';

/** Fallback when no workspace can be resolved (shouldn't happen post-auth). */
const DASHBOARD_FALLBACK = '/dashboard';

/**
 * The canonical post-auth / default landing path: the first workspace and,
 * within it, its first project. URL is the source of truth for scope, so every
 * entry point (login, register, OAuth callback, bare /dashboard) funnels here.
 */
export function defaultScopePath(
  workspaces: WorkspaceView[],
  projects: ProjectView[],
): string {
  const ws = workspaces[0];
  if (!ws) return DASHBOARD_FALLBACK;
  const proj = projects.find((p) => p.workspaceId === ws.id);
  return proj ? `/w/${ws.slug}/p/${proj.slug}` : `/w/${ws.slug}`;
}

/** Convenience for login/register. Lands on the workspace; the user picks or
 * creates a project from there (projects are no longer auto-created). */
export function scopePathFromAuthResult(result: AuthResult): string {
  return `/w/${result.workspace.slug}`;
}

/** Convenience for the OAuth callback / reload, where we have a full session. */
export function scopePathFromSession(session: SessionView): string {
  return defaultScopePath(session.workspaces, session.projects);
}
