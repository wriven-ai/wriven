import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
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

export const orgs = authSchema.table('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orgMembers = authSchema.table(
  'org_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'), // owner | admin | member
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('org_members_org_user_uq').on(t.orgId, t.userId),
    index('org_members_user_id_idx').on(t.userId),
    check(
      'org_members_role_check',
      sql`${t.role} in ('owner', 'admin', 'member')`,
    ),
  ],
);

export const workspaces = authSchema.table(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('workspaces_org_slug_uq').on(t.orgId, t.slug)],
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
    role: text('role').notNull().default('viewer'), // admin | editor | viewer
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('workspace_members_ws_user_uq').on(t.workspaceId, t.userId),
    index('workspace_members_user_id_idx').on(t.userId),
    check(
      'workspace_members_role_check',
      sql`${t.role} in ('admin', 'editor', 'viewer')`,
    ),
  ],
);
