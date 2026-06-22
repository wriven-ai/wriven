/** Shapes exchanged between auth-service and the gateway over TCP. */

export interface UserView {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  provider: string;
  emailVerified: boolean;
  createdAt: string;
}

/** Top-level tenancy unit. Owned directly by a user (`createdBy`). */
export interface WorkspaceView {
  id: string;
  name: string;
  slug: string;
  /** User id of the workspace creator. */
  createdBy: string;
  /** Caller's role in this workspace (`owner` | `admin` | `member`). */
  role: string;
}

/** A project owns CMS content and lives under a workspace. */
export interface ProjectView {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  /** User id of the project creator. */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Caller's role in this project (`admin` | `editor` | `viewer`). */
  role: string;
}

/** Result of register/login: tokens + the user's initial tenancy context. */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp — gateway uses it to set the refresh cookie maxAge. */
  refreshExpiresAt: string;
  user: UserView;
  workspace: WorkspaceView;
  project: ProjectView;
}

/** Result of a token refresh: a new access token and a rotated refresh token. */
export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

/** Payloads the gateway sends for cookie-backed operations. */
export interface RefreshPayload {
  refreshToken: string;
}

export interface LogoutPayload {
  refreshToken: string;
}

/** Structured error carried inside an RpcException across TCP. */
export interface ServiceError {
  code: string;
  message: string;
  statusCode: number;
}

/** Identity extracted from a validated access token (attached to the request). */
export interface AuthUser {
  userId: string;
  email: string;
}

/** Result of a workspace-membership check. */
export interface WorkspaceMembership {
  workspaceId: string;
  role: string;
}

/** Result of a project-membership check. */
export interface ProjectMembership {
  projectId: string;
  role: string;
}

/** Full session context — used to restore state after a page reload. */
export interface SessionView {
  user: UserView;
  workspaces: WorkspaceView[];
  projects: ProjectView[];
}

/** Verified Google profile the gateway forwards to auth-service after OAuth. */
export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatar: string | null;
}
