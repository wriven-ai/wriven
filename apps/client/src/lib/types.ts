// Client-facing API shapes. Mirrors the relevant views from @wriven/contracts
// (kept local so the frontend bundle doesn't pull in the Node/validation lib).

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

/** Returned by login / register. */
export interface AuthResult {
  accessToken: string;
  user: UserView;
  org: OrgView;
  workspace: WorkspaceView;
}

/** Returned by GET /auth/me — full session for reload restore. */
export interface SessionView {
  user: UserView;
  orgs: OrgView[];
  workspaces: WorkspaceView[];
}

/** Error payload inside a non-success envelope. */
export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  orgName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}
