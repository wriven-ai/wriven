// Client-facing API shapes. Mirrors the relevant views from @wriven/contracts.
// Role unions + the RBAC permission catalog are imported directly from
// @wriven/contracts (its rbac.types module is pure TS — no NestJS/class-validator
// runtime, so it is safe in the client bundle); the rest is mirrored locally.

import type { ProjectRole, WorkspaceRole } from '@wriven/contracts/rbac';
import { WORKSPACE_ASSIGNABLE_ROLES } from '@wriven/contracts/rbac';

export type { ProjectRole, WorkspaceRole };
/** Roles assignable when inviting (owner/guest are never granted via add). */
export type AssignableWorkspaceRole = (typeof WORKSPACE_ASSIGNABLE_ROLES)[number];

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
  role: WorkspaceRole;
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
  role: WorkspaceRole;
  createdAt: string;
  user: MemberUser;
}

export interface ProjectMemberView {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
  user: MemberUser;
}

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
  /** Project role, or null when access is derived from a workspace owner/admin role. */
  role: ProjectRole | null;
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

// ── Billing (Stripe) ────────────────────────────────────────────────────────

export interface PlanLimits {
  projects?: number | null;
  members?: number | null;
  environments?: number | null;
  contentTypes?: number | null;
  entries?: number | null;
  locales?: number | null;
  storageMb?: number | null;
  assetBandwidthGb?: number | null;
  apiRequestsPerMonth?: number | null;
  apiKeys?: number | null;
  webhooks?: number | null;
  revisionsPerEntry?: number | null;
  aiTextRequestsPerMonth?: number | null;
  aiImageRequestsPerMonth?: number | null;
}

export interface PlanFeatures {
  scheduledPublishing?: boolean;
  revisionHistory?: boolean;
  customRoles?: boolean;
  auditLog?: boolean;
  previewApi?: boolean;
  supportTier?: 'community' | 'email' | 'priority';
}

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

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'paused'
  | 'incomplete';
export type BillingCycle = 'monthly' | 'yearly';

export interface SubscriptionView {
  planKey: string;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasPaymentMethod: boolean;
}

export interface CheckoutSessionView {
  url: string;
  sessionId: string;
}

export interface PortalSessionView {
  url: string;
}

/** A billing window. v1 = calendar month, UTC midnight boundaries. */
export interface UsagePeriod {
  start: string;
  end: string;
}

/**
 * Current-period workspace usage vs plan limits. `limit: null` = the plan
 * dimension is unlimited. Backed by `GET /usage` (specs/14).
 */
export interface UsageView {
  period: UsagePeriod;
  requests: { used: number; limit: number | null };
  storage: { usedMb: number; limitMb: number | null };
}

export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'uncollectible'
  | 'void';

/** A Stripe invoice (link-out only — `url` is the hosted PDF). */
export interface InvoiceView {
  id: string;
  number: string | null;
  amountPaid: number; // cents
  currency: string;
  status: InvoiceStatus;
  createdAt: string; // ISO
  description: string | null;
  url: string | null;
}

export interface CreateCheckoutInput {
  planKey: 'starter' | 'pro';
  billingCycle: BillingCycle;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CreatePortalInput {
  returnUrl?: string;
}
