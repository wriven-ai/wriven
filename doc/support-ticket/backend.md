# Support Tickets — Backend Plan

Implementation plan for the support-ticket API in **this monorepo**. Mirrors the
existing tenant module shape (media/webhooks): `core_svc` Drizzle tables, a
core-service module behind `core.support.*` / `admin.support.*` TCP patterns, and
gateway controllers under the existing guards. Shared model + lifecycle in
[README.md](./README.md). **Plan only — build later.**

> Conventions to follow: bare `workspaceId`/`authorId` uuids (no cross-service FK),
> the `{ success, data }` envelope, `rpcError(...)`, `@Audit` on admin writes, all
> lists paginated. Same as
> [media.service.ts](../../apps/core-service/src/media/media.service.ts) and
> [admin backend docs](../admin-panel/backend/).

---

## 1. Schema (`core_svc`)

Add to [apps/core-service/src/db/schema/index.ts](../../apps/core-service/src/db/schema/index.ts),
then generate + run a migration ([doc/03](../03-database.md)).

```ts
// ── Support tickets (workspace-level; staff-handled via admin panel) ─────────

export const supportTickets = coreSchema.table(
  'support_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Human-friendly reference shown as "#1042". Global identity sequence.
    number: bigint('number', { mode: 'number' }).notNull().generatedByDefaultAsIdentity(),
    workspaceId: uuid('workspace_id').notNull(),
    authorId: uuid('author_id').notNull(),            // tenant user who opened it
    subject: text('subject').notNull(),
    description: text('description').notNull(),         // the opening post
    scopeType: text('scope_type').notNull().default('general'), // general|project|billing|account|technical
    scopeProjectId: uuid('scope_project_id'),          // set iff scopeType = 'project'
    status: text('status').notNull().default('open'),  // open|pending|resolved|closed
    priority: text('priority').notNull().default('normal'), // low|normal|high|urgent (staff-only)
    assignedAdminId: uuid('assigned_admin_id'),        // admin_user handling it (no FK)
    // Reply / SLA bookkeeping
    lastReplyAt: timestamp('last_reply_at', { withTimezone: true }),
    lastReplyBy: text('last_reply_by'),                // 'user' | 'admin' (unread hint)
    firstRespondedAt: timestamp('first_responded_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('support_tickets_number_uq').on(t.number),
    index('support_tickets_workspace_id_idx').on(t.workspaceId),
    index('support_tickets_author_id_idx').on(t.authorId),
    index('support_tickets_status_idx').on(t.status),
    index('support_tickets_assigned_admin_idx').on(t.assignedAdminId),
    check('support_tickets_scope_check', sql`${t.scopeType} in ('general','project','billing','account','technical')`),
    check('support_tickets_status_check', sql`${t.status} in ('open','pending','resolved','closed')`),
    check('support_tickets_priority_check', sql`${t.priority} in ('low','normal','high','urgent')`),
  ],
);

export const supportTicketMessages = coreSchema.table(
  'support_ticket_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
    authorType: text('author_type').notNull(),         // 'user' | 'admin'
    authorId: uuid('author_id').notNull(),             // tenant user id OR admin_user id
    body: text('body').notNull(),
    isInternalNote: boolean('is_internal_note').notNull().default(false), // admin-only; never shown to the tenant
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('support_ticket_messages_ticket_id_idx').on(t.ticketId),
    check('support_ticket_messages_author_type_check', sql`${t.authorType} in ('user','admin')`),
  ],
);

export const supportTicketAttachments = coreSchema.table(
  'support_ticket_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => supportTicketMessages.id, { onDelete: 'cascade' }), // null = opening description
    r2Key: text('r2_key').notNull(),
    mime: text('mime'),
    sizeBytes: integer('size_bytes'),
    originalFilename: text('original_filename'),
    uploadedBy: uuid('uploaded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('support_ticket_attachments_ticket_id_idx').on(t.ticketId),
    uniqueIndex('support_ticket_attachments_r2_key_uq').on(t.r2Key),
  ],
);
```

Notes:
- `number` via Postgres identity → stable, gapless-ish, human reference. Display `#${number}`.
- **≤ 3 attachments** per ticket/message is enforced in the service (count check),
  not the DB.
- `scopeProjectId` is validated in the gateway against the caller's workspace
  projects; stored bare (no FK — projects live in `auth_svc`).

---

## 2. Attachments (R2) — reuse the media flow

Same two-step browser-direct upload the media module uses:

1. **Presign** — `POST /support/tickets/attachments/presign` → core
   `support.attachment.presign`. Validate `image/*` only + size via
   `maxBytesForContentType`; key prefix **`support/{workspaceId}/{uuid}.{ext}`**
   (own prefix so support assets never mix with project media). Return
   `{ uploadUrl, key }` from `StorageService.presignUpload`.
2. Browser PUTs bytes to R2.
3. On ticket/reply create, the client sends the uploaded **keys** (`attachmentKeys: string[]`,
   ≤3). The service verifies each key starts with the `support/{workspaceId}/`
   prefix (never trust a raw key), then inserts `support_ticket_attachments` rows.

Storage **is not** counted against the plan `storageMb` quota (support assets are
operational, not tenant content). Note for later: a small dedicated cap + cleanup on
ticket close.

---

## 3. Contracts (`libs/shared/contracts`)

**types/support.types.ts**
```ts
export const SUPPORT_STATUSES = ['open','pending','resolved','closed'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_PRIORITIES = ['low','normal','high','urgent'] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];
export const SUPPORT_SCOPES = ['general','project','billing','account','technical'] as const;
export type SupportScope = (typeof SUPPORT_SCOPES)[number];

export interface SupportAttachmentView { id: string; url: string; mime: string | null; sizeBytes: number | null; originalFilename: string | null; }
export interface SupportMessageView { id: string; authorType: 'user' | 'admin'; authorId: string; authorName?: string; body: string; createdAt: string; attachments: SupportAttachmentView[]; /* isInternalNote NOT sent to tenant */ }
export interface SupportTicketRow { id: string; number: number; subject: string; scopeType: SupportScope; scopeProjectId: string | null; status: SupportStatus; priority: SupportPriority; lastReplyAt: string | null; lastReplyBy: 'user'|'admin'|null; createdAt: string; }
export interface SupportTicketDetail extends SupportTicketRow { workspaceId: string; authorId: string; description: string; attachments: SupportAttachmentView[]; messages: SupportMessageView[]; }
```

**dto/support.dto.ts**
```ts
export class PresignTicketAttachmentDto { /* filename, contentType, size */ }
export class CreateTicketDto {
  subject!: string;        // @IsString @Length(3,160)
  description!: string;    // @IsString @Length(1,5000)
  scopeType?: SupportScope;          // @IsOptional @IsIn(SUPPORT_SCOPES)
  scopeProjectId?: string;           // @ValidateIf scopeType==='project' @IsUUID
  attachmentKeys?: string[];         // @IsOptional @IsArray @ArrayMaxSize(3)
}
export class CreateTicketMessageDto { body!: string; attachmentKeys?: string[]; } // ≤3
export class ListTicketsQueryDto { /* page, limit, status?, scopeType? */ }
// Admin
export class AdminTicketListQueryDto { /* page, limit, status?, priority?, scopeType?, workspaceId?, assignedAdminId?, q? */ }
export class AdminReplyDto { body!: string; internalNote?: boolean; attachmentKeys?: string[]; }
export class AdminUpdateTicketDto { status?: SupportStatus; priority?: SupportPriority; assignedAdminId?: string | null; }
```

**messages.ts**
```ts
// CORE_PATTERNS (tenant)
SUPPORT_PRESIGN:  'core.support.presign',
SUPPORT_CREATE:   'core.support.create',
SUPPORT_LIST:     'core.support.list',
SUPPORT_GET:      'core.support.get',
SUPPORT_REPLY:    'core.support.reply',
SUPPORT_CLOSE:    'core.support.close',
// ADMIN_PATTERNS (cross-tenant)
SUPPORT_LIST:     'admin.support.list',
SUPPORT_GET:      'admin.support.get',
SUPPORT_REPLY:    'admin.support.reply',
SUPPORT_UPDATE:   'admin.support.update',   // status / priority / assignee
SUPPORT_METRICS:  'admin.support.metrics',
```

No new error codes required — reuse `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`,
`CONFLICT`. (Anti-spam cap → `rpcError('CONFLICT', 'Too many open tickets…')`.)

---

## 4. core-service module

```
apps/core-service/src/support/
  support.service.ts          # tenant: presign, create, list, get, reply, close
  admin-support.service.ts    # cross-tenant: list, get, reply, update, metrics
  support.controller.ts       # @MessagePattern('core.support.*' + 'admin.support.*')
  support.module.ts
```

`support.service.ts` responsibilities:
- **create** — insert ticket (`status:'open'`) + opening attachments (verify keys);
  enforce anti-spam open-ticket cap per workspace; return detail.
- **reply** (`authorType:'user'`) — append message + attachments; if ticket was
  `pending`/`resolved`/recently-`closed` → set `status:'open'` (reopen); update
  `lastReplyAt/By`. Block reply on a long-closed ticket (→ `CONFLICT`, open a new one).
- **list** — workspace-scoped, paginated, filter by status/scope. Visibility rule
  per [README §6](./README.md) (author vs workspace-admin) — resolved at the gateway
  from membership role.
- **get** — ticket + thread + attachments. **Strips `isInternalNote` messages** for
  tenant callers.
- **close** — author closes own ticket (`status:'closed'`, `closedAt`). Cannot set
  priority/assignee.

`admin-support.service.ts` (mirrors `apps/core-service/src/admin/*`):
- **list** — cross-tenant queue; filter status/priority/scope/workspace/assignee + `q`
  (subject / `#number`). Batched author/workspace labels — no N+1.
- **get** — full thread **including** internal notes.
- **reply** (`authorType:'admin'`) — append message; `internalNote` keeps status,
  else set `pending` + stamp `firstRespondedAt` if first staff reply; update
  `lastReplyAt/By:'admin'`.
- **update** — set `status` (stamp `resolvedAt`/`closedAt`), `priority`, `assignedAdminId`.
- **metrics** — counts by status, unassigned count, avg first-response — for the
  admin Overview widget + Support screen header.

---

## 5. Gateway controllers

**Tenant — `apps/api-gateway/src/support/support.controller.ts`**
`@UseGuards(JwtAuthGuard, WorkspaceGuard)` (workspace-level → **no** `ProjectGuard`),
`@CurrentWorkspace()` + `@CurrentUser()`, forwards to `core.support.*`:
```
POST   /support/tickets/attachments/presign
POST   /support/tickets
GET    /support/tickets                 # workspace-scoped, paginated
GET    /support/tickets/:id
POST   /support/tickets/:id/messages    # reply
PATCH  /support/tickets/:id             # author close/reopen only
```
Validate `scopeProjectId` belongs to the workspace before forwarding (reuse the
project-membership check the existing controllers use). Pass the caller's
workspace-role so the service applies the visibility rule.

**Admin — `apps/api-gateway/src/admin/admin-support.controller.ts`**
`@UseGuards(AdminJwtGuard)`, role-gated + `@Audit`, forwards to `admin.support.*`:
```
GET    /admin/support/tickets                 # queue (any admin, incl. member read-only)
GET    /admin/support/tickets/:id
POST   /admin/support/tickets/:id/messages    [admin|moderator]  @Audit('support.reply')
PATCH  /admin/support/tickets/:id             [admin|moderator]  @Audit('support.update')
GET    /admin/support/metrics
```
Add `admin.support.*` to `ADMIN_PATTERNS` ([admin backend/05](../admin-panel/backend/05-rpc.md)).
Every staff write is audited ([admin backend/04](../admin-panel/backend/04-audit.md)).

---

## 6. Build order

1. Schema + migration (3 tables).
2. Contracts: types + DTOs + `CORE_PATTERNS.SUPPORT_*` / `ADMIN_PATTERNS.SUPPORT_*`.
3. core `support/` module: tenant service (presign/create/list/get/reply/close).
4. Gateway tenant `support/` controller under `JwtAuthGuard + WorkspaceGuard`.
5. core `admin-support` service + gateway `admin-support` controller (role + `@Audit`).
6. Anti-spam cap + throttle; `.env`/docs; wire admin Overview metric widget.

**Deferred:** email notifications (transactional-email infra), `resolved→closed`
auto-close job, attachment cleanup on close, CSAT rating on close, SLA timers.
