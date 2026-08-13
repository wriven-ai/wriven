import { relations, sql } from 'drizzle-orm';
import {
  bigint,
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

/** All core-service tables live in the `core_svc` Postgres schema. */
export const coreSchema = pgSchema('core_svc');

/**
 * NOTE: workspace_id / project_id / author_id / created_by are auth-service
 * identifiers. They are plain uuid columns with NO foreign key — auth_svc is a
 * separate service boundary. The gateway validates them before requests reach
 * here. project_id is the primary scoping key; workspace_id is denormalized for
 * workspace-level queries and is always consistent with the project's workspace.
 */

// ── Content types (user-defined structure) ──────────────────────────────────

/**
 * A project-defined content type. `fields` holds the field definitions
 * (see FieldDef in @wriven/contracts) the user chose; entries of this type
 * store values keyed by those field keys.
 */
export const contentTypes = coreSchema.table(
  'content_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    name: text('name').notNull(),
    apiId: text('api_id').notNull(), // machine name, e.g. "blog_post"
    fields: jsonb('fields')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdBy: uuid('created_by').notNull(),
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
    uniqueIndex('content_types_project_api_id_uq').on(t.projectId, t.apiId),
    index('content_types_project_id_idx').on(t.projectId),
    index('content_types_workspace_id_idx').on(t.workspaceId),
  ],
);

// ── Content entries (actual content; values live in `data` jsonb) ────────────

export const contentEntries = coreSchema.table(
  'content_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    contentTypeId: uuid('content_type_id')
      .notNull()
      .references(() => contentTypes.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    status: text('status').notNull().default('draft'), // draft|published|archived
    data: jsonb('data')
      .notNull()
      .default(sql`'{}'::jsonb`),
    authorId: uuid('author_id').notNull(),
    createdBy: uuid('created_by').notNull(),
    updatedBy: uuid('updated_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
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
    uniqueIndex('content_entries_project_type_slug_uq').on(
      t.projectId,
      t.contentTypeId,
      t.slug,
    ),
    index('content_entries_project_id_idx').on(t.projectId),
    index('content_entries_workspace_id_idx').on(t.workspaceId),
    index('content_entries_type_idx').on(t.contentTypeId),
    index('content_entries_status_idx').on(t.status),
    // GIN index for querying inside the JSONB field values.
    index('content_entries_data_gin').using('gin', t.data),
    check(
      'content_entries_status_check',
      sql`${t.status} in ('draft', 'published', 'archived')`,
    ),
  ],
);

// ── Revisions (version history of an entry's data) ───────────────────────────

export const contentRevisions = coreSchema.table(
  'content_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => contentEntries.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    data: jsonb('data').notNull(),
    status: text('status').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('content_revisions_entry_version_uq').on(t.entryId, t.version),
    index('content_revisions_entry_id_idx').on(t.entryId),
  ],
);

// ── Media library (Cloudflare R2 object keys only — never URLs) ──────────────

export const mediaAssets = coreSchema.table(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    r2Key: text('r2_key').notNull(),
    kind: text('kind').notNull().default('image'), // image|video|file
    mime: text('mime'),
    sizeBytes: integer('size_bytes'),
    width: integer('width'),
    height: integer('height'),
    alt: text('alt'),
    originalFilename: text('original_filename'),
    uploadedBy: uuid('uploaded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('media_assets_project_id_idx').on(t.projectId),
    index('media_assets_workspace_id_idx').on(t.workspaceId),
    uniqueIndex('media_assets_project_r2_key_uq').on(t.projectId, t.r2Key),
    check(
      'media_assets_kind_check',
      sql`${t.kind} in ('image', 'video', 'file')`,
    ),
  ],
);

// ── API keys (authenticate the public Content Delivery API) ──────────────────

/**
 * A project-scoped API key. The raw token is shown to the user exactly once at
 * creation; we persist ONLY its sha-256 hash (`tokenHash`) plus a display
 * `prefix`. The gateway resolves a presented token by hashing it and looking it
 * up here. See plans/01 — Model A build plan.
 */
export const apiKeys = coreSchema.table(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(), // sha-256 hex of the raw token
    prefix: text('prefix').notNull(), // display only, e.g. "wrk_live_a1b2"
    scope: text('scope').notNull().default('read'), // read|preview|manage
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('api_keys_token_hash_uq').on(t.tokenHash),
    index('api_keys_project_id_idx').on(t.projectId),
    index('api_keys_workspace_id_idx').on(t.workspaceId),
    check(
      'api_keys_scope_check',
      sql`${t.scope} in ('read', 'preview', 'manage')`,
    ),
  ],
);

// ── Webhooks (publish → signed POST; see plans/01 P6) ─────────────────────────

/**
 * Outgoing webhook subscriptions. On publish/unpublish/delete, core POSTs a
 * signed JSON payload to `url`. The `secret` is stored to sign requests (HMAC)
 * and is shown to the user only once at creation.
 */
export const webhooks = coreSchema.table(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    url: text('url').notNull(),
    events: jsonb('events').$type<string[]>().notNull(),
    secret: text('secret').notNull(), // signs outgoing payloads (HMAC-SHA256)
    active: boolean('active').notNull().default(true),
    lastStatus: integer('last_status'),
    lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('webhooks_project_id_idx').on(t.projectId)],
);

// ── Support tickets (workspace-level; staff-handled via admin panel) ─────────

export const supportTickets = coreSchema.table(
  'support_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: bigint('number', { mode: 'number' })
      .notNull()
      .generatedByDefaultAsIdentity(),
    workspaceId: uuid('workspace_id').notNull(),
    authorId: uuid('author_id').notNull(),
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    scopeType: text('scope_type').notNull().default('general'),
    scopeProjectId: uuid('scope_project_id'),
    status: text('status').notNull().default('open'),
    priority: text('priority').notNull().default('normal'),
    assignedAdminId: uuid('assigned_admin_id'),
    lastReplyAt: timestamp('last_reply_at', { withTimezone: true }),
    lastReplyBy: text('last_reply_by'),
    firstRespondedAt: timestamp('first_responded_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
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
    uniqueIndex('support_tickets_number_uq').on(t.number),
    index('support_tickets_workspace_id_idx').on(t.workspaceId),
    index('support_tickets_author_id_idx').on(t.authorId),
    index('support_tickets_status_idx').on(t.status),
    index('support_tickets_assigned_admin_idx').on(t.assignedAdminId),
    check(
      'support_tickets_scope_check',
      sql`${t.scopeType} in ('general','project','billing','account','technical')`,
    ),
    check(
      'support_tickets_status_check',
      sql`${t.status} in ('open','pending','resolved','closed')`,
    ),
    check(
      'support_tickets_priority_check',
      sql`${t.priority} in ('low','normal','high','urgent')`,
    ),
  ],
);

export const supportTicketMessages = coreSchema.table(
  'support_ticket_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    authorType: text('author_type').notNull(),
    authorId: uuid('author_id').notNull(),
    body: text('body').notNull(),
    isInternalNote: boolean('is_internal_note').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('support_ticket_messages_ticket_id_idx').on(t.ticketId),
    check(
      'support_ticket_messages_author_type_check',
      sql`${t.authorType} in ('user','admin')`,
    ),
  ],
);

export const supportTicketAttachments = coreSchema.table(
  'support_ticket_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => supportTicketMessages.id, {
      onDelete: 'cascade',
    }),
    r2Key: text('r2_key').notNull(),
    mime: text('mime'),
    sizeBytes: integer('size_bytes'),
    originalFilename: text('original_filename'),
    uploadedBy: uuid('uploaded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('support_ticket_attachments_ticket_id_idx').on(t.ticketId),
    uniqueIndex('support_ticket_attachments_r2_key_uq').on(t.r2Key),
  ],
);

// ── Usage metering (Delivery API request counter; workspace = billing unit) ─

/**
 * Per-workspace, per-period Delivery API request counter. One row per
 * workspace × billing period, incremented atomically
 * (`ON CONFLICT … request_count + n`). `workspace_id` has no cross-schema FK
 * (auth_svc boundary — same denormalized pattern as content_entries). The
 * gateway batches increments off the hot path and flushes via core.usage.record.
 * See specs/14.
 */
export const usageBuckets = coreSchema.table(
  'usage_buckets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    requestCount: bigint('request_count', { mode: 'number' })
      .notNull()
      .default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('usage_buckets_workspace_period_uq').on(
      t.workspaceId,
      t.periodStart,
    ),
    index('usage_buckets_workspace_idx').on(t.workspaceId),
  ],
);

// ── AI generation log (metering + audit; workspace = billing unit) ──────────

/**
 * One row per AI generation. Doubles as the metering source (row-count vs
 * `aiTextRequestsPerMonth`) and an audit trail with token totals. `status`
 * flows `pending` (reserved before the provider call) → `succeeded` | `failed`.
 * Quota reserves against `status IN ('pending','succeeded')`; the `/usage` stat
 * counts only `succeeded`, while token/cost sums include `failed` (a failed call
 * still burned tokens). `content_type_id` / `entry_id` are plain uuids with no
 * FK — a generation record survives its target being deleted. The idempotency key
 * and persisted output make this row the durable hand-off record for the future
 * worker queue; no separate job table needs to replace it later.
 *
 * `target_kind` distinguishes a single-field generation from a whole-entry
 * `compose`; for `compose`, `field_key` is null and `applied_field_keys` records
 * which fields of the returned record the author actually applied. See specs/21.
 */
export const aiGenerations = coreSchema.table(
  'ai_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    contentTypeId: uuid('content_type_id'),
    entryId: uuid('entry_id'),
    /** Target field key. Null for a whole-entry `compose`. */
    fieldKey: text('field_key'),
    /** `field` (single field) | `entry` (whole-entry compose). */
    targetKind: text('target_kind').notNull().default('field'),
    operation: text('operation').notNull(), // generate|compose|refine|expand|shorten|rewrite|tone|summarize|continue
    idempotencyKey: uuid('idempotency_key').notNull().defaultRandom(),
    /** SHA-256 of the stable request payload; prevents accidental key reuse. */
    requestHash: text('request_hash'),
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    totalTokens: integer('total_tokens'),
    /** Generated content kept only long enough to replay an idempotent request. */
    output: text('output'),
    promptVersion: text('prompt_version').notNull().default('text-v2'),
    latencyMs: integer('latency_ms'),
    attemptCount: integer('attempt_count').notNull().default(1),
    providerRequestId: text('provider_request_id'),
    finishReason: text('finish_reason'),
    /** Known provider spend in USD × 1,000,000; null when pricing is unavailable. */
    costMicrousd: integer('cost_microusd'),
    /** Plain uuid: audit survives revision pruning and entry deletion. */
    appliedRevisionId: uuid('applied_revision_id'),
    /** For a `compose` apply: which record field keys the author committed. */
    appliedFieldKeys: jsonb('applied_field_keys').$type<string[]>(),
    status: text('status').notNull().default('pending'), // pending|succeeded|failed
    error: text('error'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ai_generations_workspace_created_idx').on(t.workspaceId, t.createdAt),
    index('ai_generations_entry_id_idx').on(t.entryId),
    index('ai_generations_project_id_idx').on(t.projectId),
    uniqueIndex('ai_generations_workspace_creator_idempotency_uq').on(
      t.workspaceId,
      t.createdBy,
      t.idempotencyKey,
    ),
    check(
      'ai_generations_status_check',
      sql`${t.status} in ('pending', 'succeeded', 'failed')`,
    ),
    check(
      'ai_generations_target_kind_check',
      sql`${t.targetKind} in ('field', 'entry')`,
    ),
  ],
);

/**
 * Per-project AI "voice" configuration (specs/21). Operator-authored guidance
 * injected into the generation system prompt: a brand voice description, a
 * glossary of preferred terms, and a default output language. One row per
 * project (absent row = no guidance = today's neutral behavior). This is
 * configuration, not tenant content — but it is still fenced in the prompt.
 */
export const aiProfiles = coreSchema.table(
  'ai_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    projectId: uuid('project_id').notNull(),
    /** Free-text brand/voice description; capped in the DTO. */
    brandVoice: text('brand_voice'),
    /** `[{ term, prefer }]` — preferred terminology the model should use. */
    glossary: jsonb('glossary')
      .$type<{ term: string; prefer: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** BCP-47-ish output language hint (e.g. "en", "fr"). */
    language: text('language'),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('ai_profiles_project_uq').on(t.projectId),
    index('ai_profiles_workspace_id_idx').on(t.workspaceId),
  ],
);

// ── Relations (Drizzle relational query API; no DB change) ──────────────────

export const contentTypesRelations = relations(contentTypes, ({ many }) => ({
  entries: many(contentEntries),
}));

export const contentEntriesRelations = relations(
  contentEntries,
  ({ one, many }) => ({
    type: one(contentTypes, {
      fields: [contentEntries.contentTypeId],
      references: [contentTypes.id],
    }),
    revisions: many(contentRevisions),
  }),
);

export const contentRevisionsRelations = relations(
  contentRevisions,
  ({ one }) => ({
    entry: one(contentEntries, {
      fields: [contentRevisions.entryId],
      references: [contentEntries.id],
    }),
  }),
);

export const supportTicketsRelations = relations(
  supportTickets,
  ({ many }) => ({
    messages: many(supportTicketMessages),
    attachments: many(supportTicketAttachments),
  }),
);

export const supportTicketMessagesRelations = relations(
  supportTicketMessages,
  ({ one, many }) => ({
    ticket: one(supportTickets, {
      fields: [supportTicketMessages.ticketId],
      references: [supportTickets.id],
    }),
    attachments: many(supportTicketAttachments),
  }),
);

export const supportTicketAttachmentsRelations = relations(
  supportTicketAttachments,
  ({ one }) => ({
    ticket: one(supportTickets, {
      fields: [supportTicketAttachments.ticketId],
      references: [supportTickets.id],
    }),
    message: one(supportTicketMessages, {
      fields: [supportTicketAttachments.messageId],
      references: [supportTicketMessages.id],
    }),
  }),
);
