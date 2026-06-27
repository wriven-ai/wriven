import type {
  ApiError,
  AssignableWorkspaceRole,
  AuthResult,
  ContentEntryView,
  ContentTypeView,
  EntryStatus,
  FieldDef,
  LoginInput,
  Paginated,
  ProjectView,
  RegisterInput,
  SessionView,
  WorkspaceMemberView,
  WorkspaceRole,
  WorkspaceView,
} from './types';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';

/**
 * The API client is decoupled from the auth store via injected accessors,
 * wired once in <Providers>. Avoids a store ↔ api import cycle.
 *
 * Auth is fully cookie-based: the access + refresh tokens live in httpOnly
 * cookies the client can't read. The client only mirrors the URL scope
 * (workspace/project) into headers and echoes the CSRF token.
 */
interface AuthAccessors {
  getWorkspaceId: () => string | null;
  getProjectId: () => string | null;
  onAuthFailure: () => void;
}

let accessors: AuthAccessors = {
  getWorkspaceId: () => null,
  getProjectId: () => null,
  onAuthFailure: () => undefined,
};

export function configureApi(next: AuthAccessors): void {
  accessors = next;
}

// CSRF token (synchronizer pattern): the gateway returns it in auth response
// bodies (login/register/refresh/me). Held in memory only — never persisted,
// never read from a cookie (the cookie is httpOnly and cross-host). Echoed as
// X-CSRF-Token on mutating requests; the gateway matches it to its cookie.
let csrfToken: string | null = null;

/** Capture the CSRF token if a response payload carries one. */
function captureCsrf(data: unknown): void {
  if (data && typeof data === 'object' && 'csrfToken' in data) {
    const t = (data as { csrfToken: unknown }).csrfToken;
    if (typeof t === 'string') csrfToken = t;
  }
}

export class ApiRequestError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
  }
}

const MUTATING = new Set(['POST', 'PATCH', 'DELETE']);

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Authenticated endpoint: on a 401, refresh the session cookie and retry. */
  auth?: boolean;
  /** Attach the X-Workspace-Id header. */
  workspace?: boolean;
  /** Attach the X-Project-Id header. */
  project?: boolean;
}

// De-dupe concurrent refreshes so a burst of 401s triggers one refresh call.
let refreshInFlight: Promise<boolean> | null = null;

/** Rotate the session via the refresh cookie. New access+csrf cookies are set
 *  by the gateway on the response; nothing to read here. */
async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        });
        if (!res.ok) return false;
        const json = await res.json().catch(() => null);
        if (json?.success) captureCsrf(json.data);
        return !!json?.success;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

async function request<T>(
  path: string,
  opts: RequestOptions = {},
  retried = false,
): Promise<T> {
  const {
    method = 'GET',
    body,
    auth = true,
    workspace = false,
    project = false,
  } = opts;
  const headers: Record<string, string> = {};
  if (process.env.NEXT_PUBLIC_USE_NGROK === 'true')
    headers['ngrok-skip-browser-warning'] = 'true';
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // Cookie-based auth: the access cookie rides automatically via credentials.
  // Mutating requests echo the in-memory CSRF token as a header (double-submit).
  if (MUTATING.has(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  if (workspace) {
    const ws = accessors.getWorkspaceId();
    if (ws) headers['X-Workspace-Id'] = ws;
  }
  if (project) {
    const pid = accessors.getProjectId();
    if (pid) headers['X-Project-Id'] = pid;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Expired access cookie → refresh once, then retry the original request.
  if (res.status === 401 && auth && !retried) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, opts, true);
    accessors.onAuthFailure();
  }

  const json = await res.json().catch(() => null);
  if (!json || json.success !== true) {
    throw new ApiRequestError(
      json?.error ?? {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error.',
        statusCode: res.status,
      },
    );
  }
  // Auth responses (login/register/me) carry a fresh CSRF token — capture it.
  captureCsrf(json.data);
  return json.data as T;
}

export const authApi = {
  register: (input: RegisterInput) =>
    request<AuthResult>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    }),
  login: (input: LoginInput) =>
    request<AuthResult>('/auth/login', {
      method: 'POST',
      body: input,
      auth: false,
    }),
  logout: () =>
    request<{ success: true }>('/auth/logout', { method: 'POST', auth: false }),
  me: () => request<SessionView>('/auth/me'),
  forgotPassword: (email: string) =>
    request<{ success: true }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      auth: false,
    }),
  resetPassword: (token: string, newPassword: string) =>
    request<{ success: true }>('/auth/reset-password', {
      method: 'POST',
      body: { token, newPassword },
      auth: false,
    }),
  verifyEmail: (token: string) =>
    request<{ success: true }>('/auth/verify-email', {
      method: 'POST',
      body: { token },
      auth: false,
    }),
  resendVerification: () =>
    request<{ success: true }>('/auth/resend-verification', { method: 'POST' }),
};

export const contentApi = {
  listTypes: () =>
    request<ContentTypeView[]>('/content/types', {
      workspace: true,
      project: true,
    }),
  createType: (dto: { name: string; apiId: string; fields: FieldDef[] }) =>
    request<ContentTypeView>('/content/types', {
      method: 'POST',
      body: dto,
      workspace: true,
      project: true,
    }),
  getType: (id: string) =>
    request<ContentTypeView>(`/content/types/${id}`, {
      workspace: true,
      project: true,
    }),
  updateType: (id: string, dto: { name?: string; fields?: FieldDef[] }) =>
    request<ContentTypeView>(`/content/types/${id}`, {
      method: 'PATCH',
      body: dto,
      workspace: true,
      project: true,
    }),
  deleteType: (id: string) =>
    request<unknown>(`/content/types/${id}`, {
      method: 'DELETE',
      workspace: true,
      project: true,
    }),

  listEntries: (params?: {
    contentTypeId?: string;
    status?: EntryStatus;
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.contentTypeId) qs.set('contentTypeId', params.contentTypeId);
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<Paginated<ContentEntryView>>(
      `/content/entries${q ? `?${q}` : ''}`,
      { workspace: true, project: true },
    );
  },
  createEntry: (dto: {
    contentTypeId: string;
    slug?: string;
    status?: string;
    data: Record<string, unknown>;
  }) =>
    request<ContentEntryView>('/content/entries', {
      method: 'POST',
      body: dto,
      workspace: true,
      project: true,
    }),
  getEntry: (id: string) =>
    request<ContentEntryView>(`/content/entries/${id}`, {
      workspace: true,
      project: true,
    }),
  updateEntry: (
    id: string,
    dto: { slug?: string; status?: string; data?: Record<string, unknown> },
  ) =>
    request<ContentEntryView>(`/content/entries/${id}`, {
      method: 'PATCH',
      body: dto,
      workspace: true,
      project: true,
    }),
  publishEntry: (id: string) =>
    request<ContentEntryView>(`/content/entries/${id}/publish`, {
      method: 'POST',
      workspace: true,
      project: true,
    }),
  deleteEntry: (id: string) =>
    request<unknown>(`/content/entries/${id}`, {
      method: 'DELETE',
      workspace: true,
      project: true,
    }),
};

export const workspaceApi = {
  list: () => request<WorkspaceView[]>('/workspaces'),
  create: (dto: { name: string; slug?: string }) =>
    request<{ workspace: WorkspaceView; project: { id: string } }>(
      '/workspaces',
      {
        method: 'POST',
        body: dto,
      },
    ),
  get: (id: string) => request<WorkspaceView>(`/workspaces/${id}`),
  update: (id: string, dto: { name?: string; slug?: string }) =>
    request<WorkspaceView>(`/workspaces/${id}`, { method: 'PATCH', body: dto }),
  remove: (id: string) =>
    request<{ success: true }>(`/workspaces/${id}`, { method: 'DELETE' }),
};

export const memberApi = {
  list: (workspaceId: string) =>
    request<WorkspaceMemberView[]>(`/workspaces/${workspaceId}/members`),
  add: (
    workspaceId: string,
    dto: { email: string; role: AssignableWorkspaceRole },
  ) =>
    request<WorkspaceMemberView>(`/workspaces/${workspaceId}/members`, {
      method: 'POST',
      body: dto,
    }),
  updateRole: (workspaceId: string, userId: string, role: WorkspaceRole) =>
    request<WorkspaceMemberView>(
      `/workspaces/${workspaceId}/members/${userId}`,
      { method: 'PATCH', body: { role } },
    ),
  remove: (workspaceId: string, userId: string) =>
    request<{ success: true }>(
      `/workspaces/${workspaceId}/members/${userId}`,
      { method: 'DELETE' },
    ),
};

export const projectApi = {
  list: (workspaceId: string) =>
    request<ProjectView[]>(`/workspaces/${workspaceId}/projects`, {
      workspace: true,
    }),
  create: (workspaceId: string, dto: { name: string; slug?: string }) =>
    request<ProjectView>(`/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      body: dto,
      workspace: true,
    }),
  get: (id: string) =>
    request<ProjectView>(`/projects/${id}`, { workspace: true }),
  update: (id: string, dto: { name?: string; slug?: string }) =>
    request<ProjectView>(`/projects/${id}`, {
      method: 'PATCH',
      body: dto,
      workspace: true,
    }),
  remove: (id: string) =>
    request<{ success: true }>(`/projects/${id}`, {
      method: 'DELETE',
      workspace: true,
    }),
};

export const api = { request };

/** Full URL to start the Google OAuth redirect flow (browser navigation). */
export const googleAuthUrl = `${BASE_URL}/auth/google`;
