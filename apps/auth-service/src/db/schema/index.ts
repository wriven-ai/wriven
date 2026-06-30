import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** All auth-service tables live in the `auth_svc` Postgres schema. */
export const authSchema = pgSchema('auth_svc');

// ── Identity ──────────────────────────────────────────────────────────────

export const users = authSchema.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    avatar: text('avatar'),
    provider: text('provider').notNull().default('local'), // 'local' | 'google'
    providerId: text('provider_id'),
    passwordHash: text('password_hash'),
    emailVerified: boolean('email_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // One linked account per external identity (NULLs distinct → many locals ok).
    uniqueIndex('users_provider_provider_id_uq').on(t.provider, t.providerId),
    check('users_provider_check', sql`${t.provider} in ('local', 'google')`),
  ],
);

export const refreshTokens = authSchema.table(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked: boolean('revoked').notNull().default(false),
    rememberMe: boolean('remember_me').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_token_hash_uq').on(t.tokenHash),
    index('refresh_tokens_user_id_idx').on(t.userId),
  ],
);

export const passwordResetTokens = authSchema.table(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('password_reset_tokens_token_hash_uq').on(t.tokenHash),
    index('password_reset_tokens_user_id_idx').on(t.userId),
  ],
);

export const emailVerificationTokens = authSchema.table(
  'email_verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('email_verification_tokens_token_hash_uq').on(t.tokenHash),
    index('email_verification_tokens_user_id_idx').on(t.userId),
  ],
);

// ── Tenancy ───────────────────────────────────────────────────────────────
// Hierarchy: User → Workspace → Project → (content, owned by core-service).
// Workspaces are the top-level tenancy unit, owned directly by a user.

export const workspaces = authSchema.table(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    // Unique per owner, not globally — each user can have their own "default".
    slug: text('slug').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('workspaces_created_by_slug_uq').on(t.createdBy, t.slug),
  ],
);

export const workspaceMembers = authSchema.table(
  'workspace_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'), // owner | admin | member
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('workspace_members_ws_user_uq').on(t.workspaceId, t.userId),
    index('workspace_members_user_id_idx').on(t.userId),
    check(
      'workspace_members_role_check',
      // guest = auto-added via a project invite; sees only assigned projects.
      sql`${t.role} in ('owner', 'admin', 'member', 'guest')`,
    ),
  ],
);

export const projects = authSchema.table(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Unique within the workspace.
    slug: text('slug').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('projects_workspace_slug_uq').on(t.workspaceId, t.slug),
    index('projects_workspace_id_idx').on(t.workspaceId),
    index('projects_created_by_idx').on(t.createdBy),
  ],
);

export const projectMembers = authSchema.table(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('viewer'), // admin | editor | viewer
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('project_members_project_user_uq').on(t.projectId, t.userId),
    index('project_members_user_id_idx').on(t.userId),
    check(
      'project_members_role_check',
      sql`${t.role} in ('admin', 'editor', 'viewer')`,
    ),
  ],
);

// ── Relations (Drizzle relational query API; no DB change) ──────────────────

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  passwordResetTokens: many(passwordResetTokens),
  emailVerificationTokens: many(emailVerificationTokens),
  workspaceMemberships: many(workspaceMembers),
  projectMemberships: many(projectMembers),
  createdWorkspaces: many(workspaces),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
);

export const emailVerificationTokensRelations = relations(
  emailVerificationTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [emailVerificationTokens.userId],
      references: [users.id],
    }),
  }),
);

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  creator: one(users, {
    fields: [workspaces.createdBy],
    references: [users.id],
  }),
  members: many(workspaceMembers),
  projects: many(projects),
}));

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
    }),
  }),
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
  members: many(projectMembers),
}));

export const projectMembersRelations = relations(
  projectMembers,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectMembers.projectId],
      references: [projects.id],
    }),
    user: one(users, {
      fields: [projectMembers.userId],
      references: [users.id],
    }),
  }),
);

// ── Invitations (pending member onboarding) ─────────────────────────────────

/**
 * A pending invitation to a workspace or project. The raw token is emailed once;
 * we persist only its sha-256 hash. Single-use, time-limited. See doc/12.
 */
export const invitations = authSchema.table(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(), // invitee, lowercased
    scope: text('scope').notNull(), // workspace | project
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    role: text('role').notNull(), // ws: admin|member · proj: admin|editor|viewer
    tokenHash: text('token_hash').notNull(),
    status: text('status').notNull().default('pending'),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('invitations_token_hash_uq').on(t.tokenHash),
    index('invitations_email_idx').on(t.email),
    index('invitations_workspace_id_idx').on(t.workspaceId),
    index('invitations_project_id_idx').on(t.projectId),
    check(
      'invitations_scope_check',
      sql`${t.scope} in ('workspace', 'project')`,
    ),
    check(
      'invitations_status_check',
      sql`${t.status} in ('pending', 'accepted', 'revoked', 'expired')`,
    ),
  ],
);

// ── Admin panel (platform staff — SEPARATE from tenant `users`) ─────────────
// The admin panel is a separate-repo console operated by Wriven staff. Its
// identity is fully isolated from tenant users: own table, own sessions, own
// JWT secret/cookies. See doc/admin-panel.

export const adminUsers = authSchema.table(
  'admin_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('member'), // admin | moderator | member
    totpSecret: text('totp_secret'), // nullable; TOTP MFA (recommended for admin)
    active: boolean('active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      'admin_users_role_check',
      sql`${t.role} in ('admin', 'moderator', 'member')`,
    ),
  ],
);

export const adminRefreshTokens = authSchema.table(
  'admin_refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked: boolean('revoked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('admin_refresh_tokens_token_hash_uq').on(t.tokenHash),
    index('admin_refresh_tokens_admin_user_id_idx').on(t.adminUserId),
  ],
);

/** Append-only record of every admin write. Mandatory for accountability. */
export const adminAuditLog = authSchema.table(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),
    action: text('action').notNull(), // e.g. 'user.suspend', 'apikey.revoke'
    targetType: text('target_type'), // 'user'|'workspace'|'project'|'entry'|...
    targetId: text('target_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('admin_audit_log_admin_user_id_idx').on(t.adminUserId),
    index('admin_audit_log_target_idx').on(t.targetType, t.targetId),
    index('admin_audit_log_created_at_idx').on(t.createdAt),
  ],
);

// ── Plans & per-workspace assignment (billing deferred; limits modelled now) ─

export const plans = authSchema.table('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(), // 'free'|'pro'|'business'
  name: text('name').notNull(),
  description: text('description'),
  // Display: ordering + whether to show on the public pricing page.
  sortOrder: integer('sort_order').notNull().default(0),
  isPublic: boolean('is_public').notNull().default(true),
  active: boolean('active').notNull().default(true),

  // Billing (Stripe-ready; all nullable until billing lands). Prices in cents.
  priceMonthly: integer('price_monthly'),
  priceYearly: integer('price_yearly'),
  currency: text('currency').notNull().default('usd'),
  stripeProductId: text('stripe_product_id'),
  stripePriceIdMonthly: text('stripe_price_id_monthly'),
  stripePriceIdYearly: text('stripe_price_id_yearly'),
  trialDays: integer('trial_days').notNull().default(0),

  // Quotas (numeric; null/absent = unlimited) — see PlanLimits in contracts.
  // { projects, members, environments, contentTypes, entries, locales,
  //   storageMb, assetBandwidthGb, apiRequestsPerMonth, apiKeys, webhooks }
  limits: jsonb('limits').notNull().default(sql`'{}'::jsonb`),
  // Entitlements (boolean/enum) — see PlanFeatures in contracts.
  // { scheduledPublishing, revisionHistory, customRoles, sso, auditLog,
  //   previewApi, supportTier }
  features: jsonb('features').notNull().default(sql`'{}'::jsonb`),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const workspacePlans = authSchema.table('workspace_plans', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('active'), // active|past_due|suspended|trialing
  overrides: jsonb('overrides'), // per-workspace limit overrides (nullable)
  assignedBy: uuid('assigned_by'), // admin_user id (no FK across concern)
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  refreshTokens: many(adminRefreshTokens),
  auditEntries: many(adminAuditLog),
}));

export const adminRefreshTokensRelations = relations(
  adminRefreshTokens,
  ({ one }) => ({
    admin: one(adminUsers, {
      fields: [adminRefreshTokens.adminUserId],
      references: [adminUsers.id],
    }),
  }),
);

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  admin: one(adminUsers, {
    fields: [adminAuditLog.adminUserId],
    references: [adminUsers.id],
  }),
}));

export const workspacePlansRelations = relations(workspacePlans, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspacePlans.workspaceId],
    references: [workspaces.id],
  }),
  plan: one(plans, {
    fields: [workspacePlans.planId],
    references: [plans.id],
  }),
}));
