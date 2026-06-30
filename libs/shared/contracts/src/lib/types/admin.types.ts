/** Shapes for the platform admin panel — exchanged auth/core ↔ gateway over TCP. */

/** Platform staff role (distinct from tenant roles). */
export type AdminRole = 'admin' | 'moderator' | 'member';

/** Public view of an admin_users row (never exposes passwordHash/totpSecret). */
export interface AdminView {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Result of an admin login: tokens + identity. */
export interface AdminAuthResult {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp — gateway uses it to set the refresh cookie maxAge. */
  refreshExpiresAt: string;
  admin: AdminView;
}

/** Result of an admin token refresh. */
export interface AdminRefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

/** Identity extracted from a validated admin access token (attached to request). */
export interface AdminAuthUser {
  adminUserId: string;
  email: string;
  role: AdminRole;
}

/** A single admin audit log entry. */
export interface AuditLogView {
  id: string;
  adminUserId: string;
  adminEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

/** Payload to record an audit entry (written by the gateway audit interceptor). */
export interface AuditWritePayload {
  adminUserId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Numeric usage quotas for a plan. `null` / absent on any field = unlimited.
 * Mirrors the dimensions production headless CMS meter on (seats, projects,
 * environments, content types, entries, locales, storage, bandwidth, API ops).
 */
export interface PlanLimits {
  projects?: number | null;
  members?: number | null; // seats
  environments?: number | null;
  contentTypes?: number | null;
  entries?: number | null;
  locales?: number | null;
  storageMb?: number | null; // media stored
  assetBandwidthGb?: number | null; // monthly delivery traffic
  apiRequestsPerMonth?: number | null;
  apiKeys?: number | null;
  webhooks?: number | null;
}

/** Boolean / enum feature entitlements unlocked by a plan. */
export interface PlanFeatures {
  scheduledPublishing?: boolean;
  revisionHistory?: boolean;
  customRoles?: boolean;
  sso?: boolean;
  auditLog?: boolean;
  previewApi?: boolean;
  supportTier?: 'community' | 'email' | 'priority';
}

/** A plan as returned to the admin panel / pricing surfaces. */
export interface PlanView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isPublic: boolean;
  active: boolean;
  priceMonthly: number | null; // cents
  priceYearly: number | null; // cents
  currency: string;
  trialDays: number;
  limits: PlanLimits;
  features: PlanFeatures;
}

// ── Tenant oversight views (cross-tenant, admin panel) ──────────────────────

/** A tenant user row in the admin Users table. */
export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  provider: string;
  emailVerified: boolean;
  suspended: boolean;
  workspaceCount: number;
  createdAt: string;
}

/** Full tenant-user detail (memberships) for the admin User detail screen. */
export interface AdminUserDetail extends AdminUserRow {
  workspaces: { id: string; name: string; slug: string; role: string }[];
  projects: {
    id: string;
    name: string;
    workspaceId: string;
    role: string;
  }[];
}

/** A workspace row in the admin Workspaces table. */
export interface AdminWorkspaceRow {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  ownerEmail: string | null;
  memberCount: number;
  projectCount: number;
  planKey: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
}

/** Full workspace detail for the admin Workspace detail screen. */
export interface AdminWorkspaceDetail extends AdminWorkspaceRow {
  members: { userId: string; email: string; name: string; role: string }[];
  projects: { id: string; name: string; slug: string }[];
}

/** A project row in the admin Projects table (cross-workspace). */
export interface AdminProjectRow {
  id: string;
  name: string;
  slug: string;
  workspaceId: string;
  workspaceName: string | null;
  createdBy: string;
  deleted: boolean;
  createdAt: string;
}

/** Platform KPI snapshot for the admin Overview screen. */
export interface AdminMetricsOverview {
  users: { total: number; verified: number };
  workspaces: { total: number };
  projects: { total: number };
  content: { entries: number; published: number };
  media: { totalBytes: number };
  plans: { key: string; name: string; count: number }[];
}
