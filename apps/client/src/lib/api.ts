import type {
  ApiError,
  AuthResult,
  LoginInput,
  RegisterInput,
  SessionView,
} from './types';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';

/**
 * The API client is decoupled from the auth store via injected accessors,
 * wired once in <Providers>. Avoids a store ↔ api import cycle.
 */
interface AuthAccessors {
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  getWorkspaceId: () => string | null;
  onAuthFailure: () => void;
}

let accessors: AuthAccessors = {
  getAccessToken: () => null,
  setAccessToken: () => undefined,
  getWorkspaceId: () => null,
  onAuthFailure: () => undefined,
};

export function configureApi(next: AuthAccessors): void {
  accessors = next;
}

export class ApiRequestError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Attach the bearer token (default true). */
  auth?: boolean;
  /** Attach the X-Workspace-Id header. */
  workspace?: boolean;
}

// De-dupe concurrent refreshes so a burst of 401s triggers one refresh call.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) {
          const token = json.data.accessToken as string;
          accessors.setAccessToken(token);
          return token;
        }
        return null;
      } catch {
        return null;
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
  const { method = 'GET', body, auth = true, workspace = false } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = accessors.getAccessToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (workspace) {
    const ws = accessors.getWorkspaceId();
    if (ws) headers['X-Workspace-Id'] = ws;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Expired access token → refresh once, then retry the original request.
  if (res.status === 401 && auth && !retried) {
    const newToken = await refreshAccessToken();
    if (newToken) return request<T>(path, opts, true);
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
  return json.data as T;
}

export const authApi = {
  register: (input: RegisterInput) =>
    request<AuthResult>('/auth/register', { method: 'POST', body: input, auth: false }),
  login: (input: LoginInput) =>
    request<AuthResult>('/auth/login', { method: 'POST', body: input, auth: false }),
  logout: () => request<{ success: true }>('/auth/logout', { method: 'POST', auth: false }),
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

export const api = { request };
