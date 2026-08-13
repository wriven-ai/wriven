import type {
  ApiError,
  AiIntent,
  AiProfileView,
  AiGlossaryTerm,
  AiRefinePreset,
  AiTargetKind,
  ApiKeyScope,
  ApiKeyView,
  AssignableWorkspaceRole,
  AuthResult,
  ContentEntryView,
  ContentTypeView,
  AcceptInvitationResult,
  CreateApiKeyResult,
  CreateWebhookResult,
  CreateCheckoutInput,
  CreatePortalInput,
  CheckoutSessionView,
  EntryStatus,
  FieldDef,
  InvitationPreview,
  InvitationView,
  LoginInput,
  MediaView,
  Paginated,
  PlanView,
  PortalSessionView,
  InvoiceView,
  PresignResult,
  ProjectMemberView,
  ProjectRole,
  ProjectView,
  RegisterInput,
  RevisionView,
  SessionView,
  SupportScope,
  SupportStatus,
  SupportTicketDetail,
  SupportTicketRow,
  SubscriptionView,
  SwapPlanInput,
  UsageView,
  UserView,
  WorkspaceStatsView,
  ProjectStatsView,
  WebhookEvent,
  WebhookView,
  WorkspaceMemberView,
  WorkspaceRole,
  WorkspaceView,
} from './types';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/v1';

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
  /** Abort only this browser request; server-side work may already be running. */
  signal?: AbortSignal;
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
    signal,
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
    signal,
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
  // Self-service profile (specs/18). User-scoped — no workspace header.
  updateProfile: (dto: { name?: string; avatar?: string | null }) =>
    request<UserView>('/users/me', { method: 'PATCH', body: dto }),
  avatarPresign: (dto: {
    filename: string;
    contentType: string;
    size?: number;
  }) =>
    request<PresignResult>('/users/me/avatar-presign', {
      method: 'POST',
      body: dto,
    }),
};

export const contentApi = {
  listTypes: async (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    const raw = await request<ContentTypeView[] | Paginated<ContentTypeView>>(
      `/content/types${q ? `?${q}` : ''}`,
      { workspace: true, project: true },
    );
    // Backend returns a flat array — normalise into the Paginated envelope.
    if (Array.isArray(raw)) {
      return {
        items: raw,
        page: params?.page ?? 1,
        limit: params?.limit ?? raw.length,
        total: raw.length,
      } as Paginated<ContentTypeView>;
    }
    return raw as Paginated<ContentTypeView>;
  },
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
    aiGenerationIds?: string[];
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
    dto: { slug?: string; status?: string; data?: Record<string, unknown>; aiGenerationIds?: string[] },
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
  listRevisions: (entryId: string) =>
    request<RevisionView[]>(`/content/entries/${entryId}/revisions`, {
      workspace: true,
      project: true,
    }),
  restoreRevision: (entryId: string, version: number) =>
    request<ContentEntryView>(
      `/content/entries/${entryId}/revisions/${version}/restore`,
      { method: 'POST', workspace: true, project: true },
    ),
};

export const aiApi = {
  generate: (
    dto: {
      requestId: string;
      contentTypeId: string;
      entryId?: string;
      targetKind: AiTargetKind;
      /** Required when `targetKind` is `'field'`. */
      fieldKey?: string;
      intent: AiIntent;
      /** Refine shortcut; only valid with `intent: 'refine'` on a field. */
      preset?: AiRefinePreset;
      instruction?: string;
      sourceContent?: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    },
    signal?: AbortSignal,
  ) =>
    request<{
      generationId: string;
      output:
        | { kind: 'scalar'; text: string }
        | { kind: 'record'; fields: Record<string, string> };
      model: string;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
      remaining: number | null;
      /** Provider hit the output cap — the result is incomplete. */
      truncated?: boolean;
    }>('/content/ai/generate', {
      method: 'POST',
      body: dto,
      workspace: true,
      project: true,
      signal,
    }),
  getProfile: () =>
    request<AiProfileView>('/content/ai/profile', { workspace: true, project: true }),
  updateProfile: (dto: {
    brandVoice?: string | null;
    glossary?: AiGlossaryTerm[];
    language?: string | null;
  }) =>
    request<AiProfileView>('/content/ai/profile', {
      method: 'PATCH',
      body: dto,
      workspace: true,
      project: true,
    }),
};

export const apiKeyApi = {
  list: () =>
    request<ApiKeyView[]>('/api-keys', { workspace: true, project: true }),
  create: (dto: { name: string; scope?: ApiKeyScope }) =>
    request<CreateApiKeyResult>('/api-keys', {
      method: 'POST',
      body: dto,
      workspace: true,
      project: true,
    }),
  revoke: (id: string) =>
    request<{ success: true }>(`/api-keys/${id}`, {
      method: 'DELETE',
      workspace: true,
      project: true,
    }),
};

export const webhookApi = {
  list: () =>
    request<WebhookView[]>('/webhooks', { workspace: true, project: true }),
  create: (dto: { url: string; events?: WebhookEvent[] }) =>
    request<CreateWebhookResult>('/webhooks', {
      method: 'POST',
      body: dto,
      workspace: true,
      project: true,
    }),
  update: (id: string, dto: { url?: string; events?: WebhookEvent[]; active?: boolean }) =>
    request<WebhookView>(`/webhooks/${id}`, {
      method: 'PATCH',
      body: dto,
      workspace: true,
      project: true,
    }),
  remove: (id: string) =>
    request<{ success: true }>(`/webhooks/${id}`, {
      method: 'DELETE',
      workspace: true,
      project: true,
    }),
};

export const mediaApi = {
  presign: (dto: { filename: string; contentType: string; size?: number }) =>
    request<PresignResult>('/content/media/presign', {
      method: 'POST',
      body: dto,
      workspace: true,
      project: true,
    }),
  create: (dto: {
    key: string;
    kind: 'image' | 'video' | 'file';
    mime?: string;
    size?: number;
    width?: number;
    height?: number;
    alt?: string;
    originalFilename?: string;
  }) =>
    request<MediaView>('/content/media', {
      method: 'POST',
      body: dto,
      workspace: true,
      project: true,
    }),
  list: (params?: { page?: number; limit?: number; search?: string; sort?: 'newest' | 'oldest' | 'name' }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.sort) qs.set('sort', params.sort);
    const q = qs.toString();
    return request<Paginated<MediaView>>(
      `/content/media${q ? `?${q}` : ''}`,
      { workspace: true, project: true },
    );
  },
  get: (id: string) =>
    request<MediaView>(`/content/media/${id}`, {
      workspace: true,
      project: true,
    }),
  remove: (id: string) =>
    request<{ success: true }>(`/content/media/${id}`, {
      method: 'DELETE',
      workspace: true,
      project: true,
    }),
  removeMany: (ids: string[]) =>
    request<{ success: true; deleted: number }>(`/content/media/bulk-delete`, {
      method: 'POST',
      body: { ids },
      workspace: true,
      project: true,
    }),
};

/** Read intrinsic pixel size of an image File (browser only). */
function readImageSize(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/**
 * Full upload: presign → PUT bytes straight to storage → persist metadata.
 * Returns the created media asset. Image dimensions are read client-side.
 */
/** Max upload size by content-type, in bytes (mirrors @wriven/contracts). */
const MEDIA_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MEDIA_MAX_OTHER_BYTES = 25 * 1024 * 1024; // 25 MB

export async function uploadMedia(file: File): Promise<MediaView> {
  const contentType = file.type || 'application/octet-stream';
  const kind: 'image' | 'video' | 'file' = contentType.startsWith('image/')
    ? 'image'
    : contentType.startsWith('video/')
      ? 'video'
      : 'file';

  const maxBytes =
    kind === 'image' ? MEDIA_MAX_IMAGE_BYTES : MEDIA_MAX_OTHER_BYTES;
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(
      `"${file.name}" is too large. Max ${mb} MB for ${
        kind === 'image' ? 'images' : 'this file type'
      }.`,
    );
  }

  let width: number | undefined;
  let height: number | undefined;
  if (kind === 'image') {
    const size = await readImageSize(file);
    if (size) {
      width = size.width;
      height = size.height;
    }
  }

  const { uploadUrl, key } = await mediaApi.presign({
    filename: file.name,
    contentType,
    size: file.size,
  });

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });
  if (!put.ok) throw new Error('Upload to storage failed.');

  return mediaApi.create({
    key,
    kind,
    mime: file.type || undefined,
    size: file.size,
    width,
    height,
    originalFilename: file.name,
  });
}

/**
 * Upload a profile photo to R2 and return the object key to store on the user
 * (specs/18). Mirrors {@link uploadMedia} but skips the `media.create` step —
 * an avatar is not a media-library asset. Image-only, ≤ the image size cap.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  if (!contentType.startsWith('image/')) {
    throw new Error('Avatar must be an image file.');
  }
  if (file.size > MEDIA_MAX_IMAGE_BYTES) {
    const mb = Math.round(MEDIA_MAX_IMAGE_BYTES / (1024 * 1024));
    throw new Error(`Avatar is too large. Max ${mb} MB.`);
  }
  const { uploadUrl, key } = await authApi.avatarPresign({
    filename: file.name,
    contentType,
    size: file.size,
  });
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });
  if (!put.ok) throw new Error('Upload to storage failed.');
  return key;
}

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

export const invitationApi = {
  createWorkspace: (
    workspaceId: string,
    dto: { email: string; role: string },
  ) =>
    request<InvitationView>(`/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      body: dto,
    }),
  createProject: (projectId: string, dto: { email: string; role: string }) =>
    request<InvitationView>(`/projects/${projectId}/invitations`, {
      method: 'POST',
      body: dto,
    }),
  listWorkspace: (workspaceId: string) =>
    request<InvitationView[]>(`/workspaces/${workspaceId}/invitations`),
  listProject: (projectId: string) =>
    request<InvitationView[]>(`/projects/${projectId}/invitations`),
  revoke: (id: string) =>
    request<{ success: true }>(`/invitations/${id}`, { method: 'DELETE' }),
  resend: (id: string) =>
    request<InvitationView>(`/invitations/${id}/resend`, { method: 'POST' }),
  /** Public — accept page reads this before login. */
  preview: (token: string) =>
    request<InvitationPreview>(`/invitations/token/${token}`, { auth: false }),
  accept: (token: string) =>
    request<AcceptInvitationResult>(`/invitations/token/${token}/accept`, {
      method: 'POST',
    }),
};

export const projectMemberApi = {
  list: (projectId: string) =>
    request<ProjectMemberView[]>(`/projects/${projectId}/members`),
  add: (projectId: string, dto: { email: string; role: ProjectRole }) =>
    request<ProjectMemberView>(`/projects/${projectId}/members`, {
      method: 'POST',
      body: dto,
    }),
  updateRole: (projectId: string, userId: string, role: ProjectRole) =>
    request<ProjectMemberView>(`/projects/${projectId}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
    }),
  remove: (projectId: string, userId: string) =>
    request<{ success: true }>(`/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    }),
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

export const supportApi = {
  presign: (dto: { filename: string; contentType: string; size?: number }) =>
    request<{ uploadUrl: string; key: string }>(
      '/support/tickets/attachments/presign',
      {
        method: 'POST',
        body: dto,
        workspace: true,
      },
    ),

  create: (dto: {
    subject: string;
    description: string;
    scopeType?: SupportScope;
    scopeProjectId?: string;
    attachmentKeys?: string[];
  }) =>
    request<SupportTicketDetail>('/support/tickets', {
      method: 'POST',
      body: dto,
      workspace: true,
    }),

  list: (params?: {
    status?: SupportStatus;
    scopeType?: SupportScope;
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.scopeType) qs.set('scopeType', params.scopeType);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<Paginated<SupportTicketRow>>(
      `/support/tickets${q ? `?${q}` : ''}`,
      { workspace: true },
    );
  },

  get: (id: string) =>
    request<SupportTicketDetail>(`/support/tickets/${id}`, { workspace: true }),

  reply: (id: string, dto: { body: string; attachmentKeys?: string[] }) =>
    request<SupportTicketDetail>(`/support/tickets/${id}/messages`, {
      method: 'POST',
      body: dto,
      workspace: true,
    }),

  close: (id: string) =>
    request<SupportTicketDetail>(`/support/tickets/${id}`, {
      method: 'PATCH',
      body: { status: 'closed' },
      workspace: true,
    }),
};

export const billingApi = {
  /** Public plan catalog (free/starter/pro). Authed mirror of the public endpoint. */
  listPlans: () => request<PlanView[]>('/billing/plans', { workspace: true }),
  /** The workspace's current subscription (always exists — defaults to free). */
  getSubscription: () =>
    request<SubscriptionView>('/billing/subscription', { workspace: true }),
  /** Last Stripe invoices for the workspace's customer (link-out only). */
  listInvoices: () =>
    request<InvoiceView[]>('/billing/invoices', { workspace: true }),
  /** Start a hosted Stripe Checkout for the free→paid transition. */
  createCheckout: (dto: CreateCheckoutInput) =>
    request<CheckoutSessionView>('/billing/checkout', {
      method: 'POST',
      body: dto,
      workspace: true,
    }),
  /** Open the hosted Stripe Billing Portal (card / plan / cancel). */
  createPortal: (dto?: CreatePortalInput) =>
    request<PortalSessionView>('/billing/portal', {
      method: 'POST',
      body: dto ?? {},
      workspace: true,
    }),
  /** Change an existing subscription's plan/cycle (proration), or cancel to free. */
  swapPlan: (dto: SwapPlanInput) =>
    request<SubscriptionView>('/billing/swap', {
      method: 'POST',
      body: dto,
      workspace: true,
    }),
};

/** Public plan catalog — no auth, no workspace header. Powers `/pricing`. */
export const plansApi = {
  listPublic: () => request<PlanView[]>('/plans'),
};

export const usageApi = {
  /** Current-period workspace usage (Delivery API requests + storage). */
  getUsage: () => request<UsageView>('/usage', { workspace: true }),
};

export const statsApi = {
  /** Workspace aggregate stats (projects, members, content, usage). See specs/17. */
  workspaceStats: () =>
    request<WorkspaceStatsView>('/stats/workspace', { workspace: true }),
  /** Project-scoped aggregate stats. */
  projectStats: () =>
    request<ProjectStatsView>('/stats/project', {
      workspace: true,
      project: true,
    }),
};

/**
 * Presign → PUT → return key (support attachment upload). Image-only, ≤5 MB, ≤3.
 */
export async function uploadSupportAttachment(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Only images allowed.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB.');
  const { uploadUrl, key } = await supportApi.presign({
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!put.ok) throw new Error('Upload to storage failed.');
  return key;
}

export const api = { request };

/** Full URL to start the Google OAuth redirect flow (browser navigation). */
export const googleAuthUrl = `${BASE_URL}/auth/google`;
