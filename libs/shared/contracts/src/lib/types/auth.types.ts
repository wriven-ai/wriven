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

export interface OrgView {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface WorkspaceView {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  role: string;
}

/** Result of register/login: tokens + the user's initial tenancy context. */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp — gateway uses it to set the refresh cookie maxAge. */
  refreshExpiresAt: string;
  user: UserView;
  org: OrgView;
  workspace: WorkspaceView;
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
