/**
 * RBAC over Wriven's existing roles (hierarchical, NIST RBAC3-style). Roles
 * stay plain strings on the membership rows; here they gain a typed union and
 * a static role → permission map. Call sites check a {@link Permission}, never
 * a role string. Dynamic custom roles are out of scope — the permission-string
 * seam is what makes that a future flip.
 */

// ──────────────────────────────────────────────────────────────────────────
// Roles — runtime `const` arrays with the union derived from them, so the
// `@IsIn(...)` validation in the DTOs and the TypeScript union can never drift.
// Values match the `text` + CHECK constraints on the membership columns.
// ──────────────────────────────────────────────────────────────────────────

export const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'guest'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const PROJECT_ROLES = ['admin', 'editor', 'viewer'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** Roles grantable via "add member" / invitation (owner/guest are not). */
export const WORKSPACE_ASSIGNABLE_ROLES = ['admin', 'member'] as const;

// ──────────────────────────────────────────────────────────────────────────
// Permissions — one flat enum, namespaced by level. Every action in the app
// gets exactly one entry. SCREAMING_SNAKE matches the `ERROR_CODES` style.
// ──────────────────────────────────────────────────────────────────────────

export enum Permission {
  // Workspace level
  WORKSPACE_VIEW = 'WORKSPACE_VIEW',
  WORKSPACE_EDIT = 'WORKSPACE_EDIT',
  WORKSPACE_DELETE = 'WORKSPACE_DELETE', // owner-only
  WORKSPACE_MEMBERS_VIEW = 'WORKSPACE_MEMBERS_VIEW',
  WORKSPACE_MEMBERS_MANAGE = 'WORKSPACE_MEMBERS_MANAGE',
  WORKSPACE_ROLE_ASSIGN = 'WORKSPACE_ROLE_ASSIGN', // owner-grant/transfer — owner-only
  WORKSPACE_PROJECT_CREATE = 'WORKSPACE_PROJECT_CREATE',
  WORKSPACE_BILLING_MANAGE = 'WORKSPACE_BILLING_MANAGE',
  WORKSPACE_USAGE_VIEW = 'WORKSPACE_USAGE_VIEW',
  WORKSPACE_LOGS_VIEW = 'WORKSPACE_LOGS_VIEW',

  // Project level (also granted to workspace owner/admin via the cascade)
  PROJECT_VIEW = 'PROJECT_VIEW',
  /** Scope marker — see all projects in the workspace (list filter = ALL). */
  PROJECT_VIEW_ALL = 'PROJECT_VIEW_ALL',
  /** Scope marker — see only projects with a project_members row (ASSIGNED). */
  PROJECT_VIEW_ASSIGNED = 'PROJECT_VIEW_ASSIGNED',
  PROJECT_EDIT = 'PROJECT_EDIT',
  PROJECT_DELETE = 'PROJECT_DELETE',
  PROJECT_MEMBERS_VIEW = 'PROJECT_MEMBERS_VIEW',
  PROJECT_MEMBERS_MANAGE = 'PROJECT_MEMBERS_MANAGE',
  PROJECT_ROLE_ASSIGN = 'PROJECT_ROLE_ASSIGN',
  CONTENT_TYPE_MANAGE = 'CONTENT_TYPE_MANAGE',
  CONTENT_ENTRY_CREATE = 'CONTENT_ENTRY_CREATE',
  CONTENT_ENTRY_UPDATE = 'CONTENT_ENTRY_UPDATE',
  CONTENT_ENTRY_PUBLISH = 'CONTENT_ENTRY_PUBLISH',
  CONTENT_ENTRY_DELETE = 'CONTENT_ENTRY_DELETE',
  AI_GENERATE = 'AI_GENERATE',
  MEDIA_MANAGE = 'MEDIA_MANAGE',
  WEBHOOK_MANAGE = 'WEBHOOK_MANAGE',
  API_KEY_MANAGE = 'API_KEY_MANAGE',
}

// ──────────────────────────────────────────────────────────────────────────
// Role → permission maps. The source of truth for what each role can do.
// Lives in code, not the DB. Top role = full set; lower roles = subsets
// (monotonic within the management power chain).
// ──────────────────────────────────────────────────────────────────────────

/** Every project-level action permission (used to build the owner/admin sets). */
const ALL_PROJECT_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permission.PROJECT_VIEW,
  Permission.PROJECT_VIEW_ALL,
  Permission.PROJECT_EDIT,
  Permission.PROJECT_DELETE,
  Permission.PROJECT_MEMBERS_VIEW,
  Permission.PROJECT_MEMBERS_MANAGE,
  Permission.PROJECT_ROLE_ASSIGN,
  Permission.CONTENT_TYPE_MANAGE,
  Permission.CONTENT_ENTRY_CREATE,
  Permission.CONTENT_ENTRY_UPDATE,
  Permission.CONTENT_ENTRY_PUBLISH,
  Permission.CONTENT_ENTRY_DELETE,
  Permission.AI_GENERATE,
  Permission.MEDIA_MANAGE,
  Permission.WEBHOOK_MANAGE,
  Permission.API_KEY_MANAGE,
]);

export const WORKSPACE_ROLE_PERMISSIONS: Record<WorkspaceRole, Set<Permission>> = {
  // Full control — every permission in the system.
  owner: new Set<Permission>(Object.values(Permission)),

  // Workspace management (minus delete + owner-grant) + every project action.
  admin: new Set<Permission>([
    Permission.WORKSPACE_VIEW,
    Permission.WORKSPACE_EDIT,
    Permission.WORKSPACE_MEMBERS_VIEW,
    Permission.WORKSPACE_MEMBERS_MANAGE,
    Permission.WORKSPACE_PROJECT_CREATE,
    Permission.WORKSPACE_BILLING_MANAGE,
    Permission.WORKSPACE_USAGE_VIEW,
    Permission.WORKSPACE_LOGS_VIEW,
    ...ALL_PROJECT_PERMISSIONS,
  ]),

  // Sees every project in the workspace but can act only with a project role.
  member: new Set<Permission>([
    Permission.WORKSPACE_VIEW,
    Permission.WORKSPACE_MEMBERS_VIEW,
    Permission.WORKSPACE_LOGS_VIEW,
    Permission.PROJECT_VIEW,
    Permission.PROJECT_VIEW_ALL,
  ]),

  // Auto-seated via a project invite — sees only assigned projects, nothing else.
  guest: new Set<Permission>([Permission.PROJECT_VIEW, Permission.PROJECT_VIEW_ASSIGNED]),
};

export const PROJECT_ROLE_PERMISSIONS: Record<ProjectRole, Set<Permission>> = {
  // Full control within the project.
  admin: new Set<Permission>([
    Permission.PROJECT_VIEW,
    Permission.PROJECT_EDIT,
    Permission.PROJECT_DELETE,
    Permission.PROJECT_MEMBERS_VIEW,
    Permission.PROJECT_MEMBERS_MANAGE,
    Permission.PROJECT_ROLE_ASSIGN,
    Permission.CONTENT_TYPE_MANAGE,
    Permission.CONTENT_ENTRY_CREATE,
    Permission.CONTENT_ENTRY_UPDATE,
    Permission.CONTENT_ENTRY_PUBLISH,
    Permission.CONTENT_ENTRY_DELETE,
    Permission.AI_GENERATE,
    Permission.MEDIA_MANAGE,
    Permission.WEBHOOK_MANAGE,
    Permission.API_KEY_MANAGE,
  ]),

  // Can create/edit content + manage media; cannot publish/delete, manage types/members/webhooks/keys.
  editor: new Set<Permission>([
    Permission.PROJECT_VIEW,
    Permission.CONTENT_ENTRY_CREATE,
    Permission.CONTENT_ENTRY_UPDATE,
    Permission.AI_GENERATE,
    Permission.MEDIA_MANAGE,
  ]),

  // Read only.
  viewer: new Set<Permission>([Permission.PROJECT_VIEW]),
};

// ──────────────────────────────────────────────────────────────────────────
// Cascade — the single definition of "effective permissions". Shared by the
// auth-service resolver and the frontend `useCan()` so both sides agree.
// Union of workspace-derived + project-assigned; higher level wins by union.
// ──────────────────────────────────────────────────────────────────────────

const EMPTY: ReadonlySet<Permission> = new Set<Permission>();

/**
 * Effective permission set for a user holding the given workspace + project
 * roles. A workspace owner/admin's set already contains every project
 * permission, so the union grants them project access with no project row.
 */
export function effectivePermissions(
  wsRole?: WorkspaceRole | null,
  projRole?: ProjectRole | null,
): Set<Permission> {
  const ws = wsRole ? WORKSPACE_ROLE_PERMISSIONS[wsRole] : EMPTY;
  const proj = projRole ? PROJECT_ROLE_PERMISSIONS[projRole] : EMPTY;
  return proj.size ? new Set<Permission>([...ws, ...proj]) : new Set<Permission>(ws);
}

// ──────────────────────────────────────────────────────────────────────────
// Scope — for list endpoints. Derived from the workspace role.
// ──────────────────────────────────────────────────────────────────────────

export type PermissionScope = 'ALL' | 'ASSIGNED' | 'NONE';

/**
 * Project-list scope for a user. Non-guest workspace members see ALL projects;
 * guests see only ASSIGNED (projects with a `project_members` row); no
 * membership → NONE.
 */
export function getProjectScope(wsRole?: WorkspaceRole | null): PermissionScope {
  if (!wsRole) return 'NONE';
  if (wsRole === 'guest') return 'ASSIGNED';
  return 'ALL'; // owner | admin | member
}
