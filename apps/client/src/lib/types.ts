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

export interface WorkspaceView {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  role: string;
  /** The user's default workspace — used as the implicit scope at /dashboard.
   *  Optional until the backend sends it; falls back to the first workspace. */
  isDefault?: boolean;
}

/** Minimal user info embedded in a member record. */
export interface MemberUser {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
}

export interface WorkspaceMemberView {
  id: string;
  workspaceId: string;
  userId: string;
  role: string; // owner | admin | member
  createdAt: string;
  user: MemberUser;
}

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';
/** Roles assignable when inviting (owner is never granted via add). */
export type AssignableWorkspaceRole = 'admin' | 'member';

export interface ProjectMemberView {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
  user: MemberUser;
}

/** Project member roles — a separate enum from workspace roles. All assignable. */
export type ProjectRole = 'admin' | 'editor' | 'viewer';

// ── Invitations ──────────────────────────────────────────────────────────────

export type InvitationScope = 'workspace' | 'project';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface InvitationView {
  id: string;
  email: string;
  scope: InvitationScope;
  workspaceId: string;
  projectId: string | null;
  role: string;
  status: InvitationStatus;
  invitedByName: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface InvitationPreview {
  email: string;
  scope: InvitationScope;
  role: string;
  workspaceName: string;
  projectName: string | null;
  inviterName: string | null;
  requiresSignup: boolean;
}

export interface AcceptInvitationResult {
  scope: InvitationScope;
  workspaceSlug: string;
  projectSlug: string | null;
}

export interface ProjectView {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  role: string;
}

/** Returned by login / register. */
export interface AuthResult {
  user: UserView;
  workspace: WorkspaceView;
}

/** Returned by GET /auth/me — full session for reload restore. */
export interface SessionView {
  user: UserView;
  workspaces: WorkspaceView[];
  projects: ProjectView[];
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
  workspaceName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

// ── CMS ──────────────────────────────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'media'
  | 'select'
  | 'reference';

export type EntryStatus = 'draft' | 'published' | 'archived';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  multiple?: boolean;
  options?: string[];
  refTypeId?: string;
}

export interface ContentTypeView {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  apiId: string;
  fields: FieldDef[];
  createdAt: string;
  updatedAt: string;
}

export interface ContentEntryView {
  id: string;
  workspaceId: string;
  projectId: string;
  contentTypeId: string;
  slug: string;
  status: EntryStatus;
  data: Record<string, unknown>;
  authorId: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionView {
  id: string;
  entryId: string;
  version: number;
  status: string;
  data: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

// ── Media ────────────────────────────────────────────────────────────────────

export interface MediaView {
  id: string;
  workspaceId: string;
  projectId: string;
  url: string;
  kind: string;
  mime: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  originalFilename: string | null;
  createdAt: string;
}

export interface PresignResult {
  uploadUrl: string;
  key: string;
}

// ── API keys (Delivery API auth) ─────────────────────────────────────────────

export type ApiKeyScope = 'read' | 'preview' | 'manage';

export interface ApiKeyView {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  prefix: string;
  scope: ApiKeyScope;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Returned only from create — carries the full raw token exactly once. */
export interface CreateApiKeyResult {
  key: ApiKeyView;
  token: string;
}

export type WebhookEvent =
  | 'entry.published'
  | 'entry.unpublished'
  | 'entry.deleted';

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  'entry.published',
  'entry.unpublished',
  'entry.deleted',
];

export interface WebhookView {
  id: string;
  workspaceId: string;
  projectId: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  lastStatus: number | null;
  lastFiredAt: string | null;
  createdAt: string;
}

/** Returned only from create — carries the signing secret exactly once. */
export interface CreateWebhookResult {
  webhook: WebhookView;
  secret: string;
}

// ── Support tickets ───────────────────────────────────────────────────────────

export type SupportStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type SupportPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SupportScope =
  | 'general'
  | 'project'
  | 'billing'
  | 'account'
  | 'technical';

export interface SupportAttachmentView {
  id: string;
  url: string;
  mime: string | null;
  sizeBytes: number | null;
  originalFilename: string | null;
}

export interface SupportMessageView {
  id: string;
  authorType: 'user' | 'admin';
  authorId: string;
  body: string;
  createdAt: string;
  attachments: SupportAttachmentView[];
}

export interface SupportTicketRow {
  id: string;
  number: number;
  subject: string;
  scopeType: SupportScope;
  scopeProjectId: string | null;
  status: SupportStatus;
  priority: SupportPriority;
  lastReplyAt: string | null;
  lastReplyBy: 'user' | 'admin' | null;
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicketRow {
  workspaceId: string;
  authorId: string;
  description: string;
  attachments: SupportAttachmentView[];
  messages: SupportMessageView[];
}
