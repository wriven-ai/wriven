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

/** Platform KPI snapshot for the admin Overview screen. */
export interface AdminMetricsOverview {
  users: { total: number; verified: number };
  workspaces: { total: number };
  projects: { total: number };
  content: { entries: number; published: number };
  media: { totalBytes: number };
  plans: { key: string; name: string; count: number }[];
}
