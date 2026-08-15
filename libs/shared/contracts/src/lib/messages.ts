/**
 * TCP message pattern constants. Never hardcode pattern strings in callers or
 * receivers — import from here. Convention: `<service>.<action>`.
 */

export const AUTH_PATTERNS = {
  PING: 'auth.ping',
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  REFRESH: 'auth.refresh',
  LOGOUT: 'auth.logout',
  FORGOT_PASSWORD: 'auth.forgotPassword',
  RESET_PASSWORD: 'auth.resetPassword',
  VERIFY_EMAIL: 'auth.verifyEmail',
  RESEND_VERIFICATION: 'auth.resendVerification',
  GOOGLE_LOGIN: 'auth.googleLogin',
  VALIDATE_USER: 'auth.validateUser',
  GET_USER_BY_ID: 'auth.getUserById',
  GET_SESSION: 'auth.getSession',
  // Self-service profile update (name + avatar key) for the authed user.
  UPDATE_PROFILE: 'auth.user.updateProfile',
  // Effective plan limits + usage for a workspace (plan enforcement).
  ENTITLEMENTS_RESOLVE: 'auth.entitlements.resolve',
} as const;

/**
 * Top-level tenancy. A workspace is owned directly by a user and contains
 * projects. Workspace members form the team that can access the workspace.
 */
export const WORKSPACE_PATTERNS = {
  CREATE_WORKSPACE: 'auth.createWorkspace',
  GET_WORKSPACE: 'auth.getWorkspace',
  LIST_WORKSPACES: 'auth.listWorkspaces',
  UPDATE_WORKSPACE: 'auth.updateWorkspace',
  DELETE_WORKSPACE: 'auth.deleteWorkspace',
  VALIDATE_WORKSPACE_MEMBER: 'auth.validateWorkspaceMember',
  LIST_MEMBERS: 'auth.workspace.listMembers',
  ADD_MEMBER: 'auth.workspace.addMember',
  UPDATE_MEMBER: 'auth.workspace.updateMember',
  REMOVE_MEMBER: 'auth.workspace.removeMember',
  STATS: 'auth.workspace.stats',
} as const;

/**
 * Projects live under a workspace and own all CMS content (content types,
 * entries, media). Project members are independent of workspace members.
 */
export const PROJECT_PATTERNS = {
  CREATE_PROJECT: 'auth.createProject',
  GET_PROJECT: 'auth.getProject',
  LIST_PROJECTS: 'auth.listProjects',
  UPDATE_PROJECT: 'auth.updateProject',
  DELETE_PROJECT: 'auth.deleteProject',
  VALIDATE_PROJECT_MEMBER: 'auth.validateProjectMember',
  LIST_MEMBERS: 'auth.project.listMembers',
  ADD_MEMBER: 'auth.project.addMember',
  UPDATE_MEMBER: 'auth.project.updateMember',
  REMOVE_MEMBER: 'auth.project.removeMember',
} as const;

export const CORE_PATTERNS = {
  PING: 'core.ping',

  CONTENT_TYPE_CREATE: 'core.contentType.create',
  CONTENT_TYPE_LIST: 'core.contentType.list',
  CONTENT_TYPE_GET: 'core.contentType.get',
  CONTENT_TYPE_UPDATE: 'core.contentType.update',
  CONTENT_TYPE_DELETE: 'core.contentType.delete',
  CONTENT_TYPE_SEED: 'core.contentType.seedDefaults',

  ENTRY_CREATE: 'core.entry.create',
  ENTRY_LIST: 'core.entry.list',
  ENTRY_GET: 'core.entry.get',
  ENTRY_UPDATE: 'core.entry.update',
  ENTRY_DELETE: 'core.entry.delete',
  ENTRY_PUBLISH: 'core.entry.publish',
  ENTRY_REVISIONS: 'core.entry.revisions',
  ENTRY_REVISION_RESTORE: 'core.entry.revisionRestore',

  // Project-scoped API keys (Delivery API auth — see plans/01).
  API_KEY_CREATE: 'core.apiKey.create',
  API_KEY_LIST: 'core.apiKey.list',
  API_KEY_REVOKE: 'core.apiKey.revoke',
  API_KEY_RESOLVE: 'core.apiKey.resolve',

  // Public Content Delivery API — published-only reads by content type.
  DELIVERY_LIST: 'core.delivery.list',
  DELIVERY_GET: 'core.delivery.get',

  // Media library (R2-backed; presigned direct upload — see specs/03).
  MEDIA_PRESIGN: 'core.media.presign',
  MEDIA_CREATE: 'core.media.create',
  MEDIA_LIST: 'core.media.list',
  MEDIA_GET: 'core.media.get',
  MEDIA_DELETE: 'core.media.delete',
  MEDIA_DELETE_BULK: 'core.media.deleteBulk',

  // Profile photo upload (R2 direct; no media_assets row — see specs/18).
  AVATAR_PRESIGN: 'core.media.avatarPresign',
  // Delete an orphaned avatar object on photo change/remove (best-effort).
  AVATAR_DELETE: 'core.media.avatarDelete',

  // Outgoing webhooks (publish → signed POST; see plans/01 P6).
  WEBHOOK_CREATE: 'core.webhook.create',
  WEBHOOK_LIST: 'core.webhook.list',
  WEBHOOK_UPDATE: 'core.webhook.update',
  WEBHOOK_DELETE: 'core.webhook.delete',

  // Support tickets (workspace-level; see doc/support-ticket/backend.md).
  SUPPORT_PRESIGN: 'core.support.presign',
  SUPPORT_CREATE: 'core.support.create',
  SUPPORT_LIST: 'core.support.list',
  SUPPORT_GET: 'core.support.get',
  SUPPORT_REPLY: 'core.support.reply',
  SUPPORT_CLOSE: 'core.support.close',
} as const;

/** Pending member invitations (workspace + project). Owned by auth-service. */
export const INVITATION_PATTERNS = {
  CREATE: 'auth.invitation.create',
  LIST: 'auth.invitation.list',
  REVOKE: 'auth.invitation.revoke',
  RESEND: 'auth.invitation.resend',
  PREVIEW: 'auth.invitation.preview',
  ACCEPT: 'auth.invitation.accept',
} as const;

/**
 * Billing & subscriptions (Stripe). Owned by auth-service (`auth_svc.plans` /
 * `subscriptions`). Customer-facing checkout/portal + the inbound Stripe webhook
 * reconciler. See specs/08.
 */
export const BILLING_PATTERNS = {
  LIST_PLANS: 'auth.billing.listPlans',
  GET_SUBSCRIPTION: 'auth.billing.getSubscription',
  LIST_INVOICES: 'auth.billing.listInvoices',
  CREATE_CHECKOUT: 'auth.billing.createCheckout',
  CREATE_PORTAL: 'auth.billing.createPortal',
  SWAP_PLAN: 'auth.billing.swapPlan',
  STRIPE_WEBHOOK: 'auth.billing.stripeWebhook',
} as const;

/**
 * Usage metering (Delivery API request counter + storage). Owned by
 * core-service (it owns the metered resources: api_keys, delivery, media).
 * The gateway batches increments off the hot path and flushes via RECORD; READ
 * composes the current-period UsageView. See specs/14.
 */
export const USAGE_PATTERNS = {
  RECORD: 'core.usage.record',
  READ: 'core.usage.read',
  WORKSPACE_STATS: 'core.usage.workspaceStats',
  PROJECT_STATS: 'core.usage.projectStats',
} as const;

/**
 * AI content generation. Core-service owns scope, policy, quota, and audit;
 * it calls the standalone Python ai-service through its internal `AiClient`.
 * The stable message pattern keeps the gateway and clients transport-agnostic.
 */
export const AI_PATTERNS = {
  GENERATE: 'core.ai.generate',
  PROFILE_READ: 'core.ai.profile.read',
  PROFILE_UPDATE: 'core.ai.profile.update',
} as const;

/**
 * Platform admin panel. Cross-tenant, god-mode operations. Backed by a separate
 * `admin_users` identity (auth-service) and cross-tenant reads in both services.
 * See doc/admin-panel.
 */
export const ADMIN_PATTERNS = {
  // Admin identity & sessions (auth-service)
  LOGIN: 'admin.auth.login',
  REFRESH: 'admin.auth.refresh',
  LOGOUT: 'admin.auth.logout',
  GET_BY_ID: 'admin.auth.getById',

  // admin_users management
  ADMINS_LIST: 'admin.admins.list',
  ADMINS_CREATE: 'admin.admins.create',
  ADMINS_UPDATE: 'admin.admins.update',
  ADMINS_DELETE: 'admin.admins.delete',

  // Audit log
  AUDIT_WRITE: 'admin.audit.write',
  AUDIT_LIST: 'admin.audit.list',

  // Cross-tenant tenancy (auth-service)
  USERS_LIST: 'admin.users.list',
  USERS_GET: 'admin.users.get',
  USERS_UPDATE: 'admin.users.update', // suspend/reactivate, force-verify
  USERS_DELETE: 'admin.users.delete',
  WORKSPACES_LIST: 'admin.workspaces.list',
  WORKSPACES_GET: 'admin.workspaces.get',
  WORKSPACES_SET_PLAN: 'admin.workspaces.setPlan',
  PROJECTS_LIST: 'admin.projects.list',
  PROJECTS_GET: 'admin.projects.get',
  PROJECTS_DELETE: 'admin.projects.delete',

  // Plans (definitions — auth-service)
  PLANS_LIST: 'admin.plans.list',
  PLANS_CREATE: 'admin.plans.create',
  PLANS_UPDATE: 'admin.plans.update',

  // Cross-tenant moderation (core-service)
  CONTENT_LIST: 'admin.content.list',
  CONTENT_GET: 'admin.content.get',
  CONTENT_TAKEDOWN: 'admin.content.takedown',
  CONTENT_TYPES_LIST: 'admin.contentTypes.list',
  MEDIA_LIST: 'admin.media.list',
  MEDIA_USAGE: 'admin.media.usage',
  MEDIA_PURGE: 'admin.media.purge',
  APIKEYS_LIST: 'admin.apiKeys.list',
  APIKEYS_REVOKE: 'admin.apiKeys.revoke',
  WEBHOOKS_LIST: 'admin.webhooks.list',
  WEBHOOKS_DISABLE: 'admin.webhooks.disable',

  // Metrics (auth-side + core-side, merged at the gateway)
  METRICS_AUTH: 'admin.metrics.auth',
  METRICS_CONTENT: 'admin.metrics.content',

  // Support tickets (cross-tenant staff management; see doc/support-ticket/backend.md).
  SUPPORT_LIST: 'admin.support.list',
  SUPPORT_GET: 'admin.support.get',
  SUPPORT_REPLY: 'admin.support.reply',
  SUPPORT_UPDATE: 'admin.support.update',
  SUPPORT_METRICS: 'admin.support.metrics',
} as const;

/** Injection tokens for the gateway's TCP ClientProxy instances. */
export const SERVICE_TOKENS = {
  AUTH_SERVICE: 'AUTH_SERVICE',
  CORE_SERVICE: 'CORE_SERVICE',
} as const;
