Database

## Engine & ORM

- **PostgreSQL** on **Supabase** (project `uqthgnqzfpelmknpfegp`).
- **Drizzle ORM** (`drizzle-orm`) over the **postgres.js** driver, with `prepare: false` (pooler-compatible).
- **drizzle-kit** for migration generation/apply.

## Single shared database, isolated by schema

All services connect to **one** Postgres database. Isolation is by **Postgres schema**, not separate databases:

| Service | Schema | Tables |
|---------|--------|--------|
| auth-service | `auth_svc` | users, refresh_tokens, password_reset_tokens, email_verification_tokens, workspaces, workspace_members, projects, project_members, invitations, plans, subscriptions, stripe_events, admin_users, admin_refresh_tokens, admin_audit_log |
| core-service | `core_svc` | content_types, content_entries, content_revisions, media_assets, api_keys, webhooks, support_tickets, support_ticket_messages, support_ticket_attachments, usage_buckets, ai_generations |
| (migrations journal) | `drizzle` | `__drizzle_migrations` (shared) |

Defined in Drizzle with `pgSchema('auth_svc')` / `pgSchema('core_svc')`. Each service runs migrations scoped to its own schema via `schemaFilter` in its `drizzle.config.ts`.

**Why one DB now:** solo-dev pragmatism. **Why schema isolation:** keeps the option to split into separate physical databases later as a *config change* — nothing relies on cross-schema access.

## No foreign keys across service boundaries

`user_id`, `workspace_id`, `project_id`, `author_id`, `created_by` in `core_svc` are plain `uuid` columns with **no FK** to `auth_svc`. This is deliberate:

- **Pro:** services are decoupled; auth can restructure its tables freely; future DB split won't break.
- **Con:** no DB-level referential integrity across services; no cross-service SQL joins.
- **Mitigations:** the gateway validates `workspace_id` / `project_id` membership at the edge; user/workspace/project deletion cleanup will be handled by events later; denormalize (e.g. snapshot author name) only where a per-render TCP call would hurt.

FKs *within* a schema are used normally (e.g. `refresh_tokens.user_id → users`, `content_entries.content_type_id → content_types`).

## Connection strings

Two URLs per DB-owning service `.env` (Prisma-style convention):

```
# Transaction-mode pooler (port 6543, IPv4) — app runtime
DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-1-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Session-mode pooler (port 5432, IPv4) — migrations
DIRECT_URL="postgresql://postgres.<ref>:<pw>@aws-1-<region>.pooler.supabase.com:5432/postgres"
```

- Runtime (`@wriven/database`) uses `DATABASE_URL`.
- `drizzle.config.ts` uses `DIRECT_URL` (falls back to `DATABASE_URL`).
- The **direct** host (`db.<ref>.supabase.co`) is IPv6-only and often unreachable; always use the pooler URLs above.

## `@wriven/database`

Shared library providing the Drizzle client — connection plumbing only, **no table definitions** (those live per-service):

```ts
DatabaseModule.forRoot({ schema })   // global module, reads process.env.DATABASE_URL
DRIZZLE                              // DI token for the drizzle instance
DrizzleDB<typeof schema>             // typed handle: PostgresJsDatabase<TSchema>
```

Each service imports it with its own schema:

```ts
@Module({ imports: [DatabaseModule.forRoot({ schema })] })   // schema = * as schema from '../db/schema'
constructor(@Inject(DRIZZLE) private db: DrizzleDB<typeof schema>) {}
```

## Query style

- **Reads** use the **relational query API** consistently: `db.query.<table>.findFirst/findMany({ where, with, columns, orderBy, limit, offset })`. This is enabled by `relations()` declarations in each schema file.
- **Aggregates** (no relational-query equivalent) use `db.select({...max/count...})` or `db.$count(table, where)`.
- **Writes** use `db.insert/update/delete`. Multi-step writes (e.g. signup, entry+revision) run in `db.transaction(async (tx) => ...)`.

`relations()` is ORM-level only — declaring them required **no migration**.

## Migrations workflow

```bash
# auth schema
pnpm db:auth:generate     # diff schema → SQL in apps/auth-service/src/db/migrations
pnpm db:auth:migrate      # apply via DIRECT_URL (session pooler)

# core schema
pnpm db:core:generate
pnpm db:core:migrate
```

Notes:
- `drizzle-kit generate` is **interactive on ambiguous renames** (drop+add looks like a rename) and fails in non-TTY. To rename/replace tables non-interactively, split into two unambiguous migrations: add-new first, then drop-old.
- Migrations applied via the session pooler; the MCP Supabase server is read-only and cannot apply DDL.
- The `drizzle.__drizzle_migrations` journal is shared by both services (one DB) — harmless `NOTICE: already exists` on the schema/journal is expected.

## Indexes & constraints (highlights)

- Unique on every token hash (`refresh_tokens`, `password_reset_tokens`, `email_verification_tokens`) — looked up on every request.
- `user_id` indexed on token + member tables (member tables also have a standalone `user_id` index, since the composite `(workspace_id, user_id)` / `(project_id, user_id)` can't serve `user_id`-only lookups).
- `users`: `unique(email)`, `unique(provider, provider_id)` (OAuth; NULLs distinct so many locals are fine), CHECK `provider in ('local','google')`.
- `workspace_members.role` / `project_members.role` CHECK constraints; `content_entries.status` CHECK `in ('draft','published','archived')`.
- `workspaces`: `unique(slug)` (globally unique — top-level tenancy). `projects`: `unique(workspace_id, slug)`. `content_entries`: `unique(project_id, content_type_id, slug)`, GIN index on `data` jsonb.
- **Billing:** `plans.key` unique; `subscriptions` `uniqueIndex(workspace_id)` (one row per workspace) + `status` CHECK `in ('active','trialing','past_due','canceled','paused','incomplete')` + `pending_change` jsonb (deferred-downgrade hint, specs/16; cleared by the reconciler at period end); `stripe_events.event_id` unique (webhook idempotency dedupe) + `event_type` index.
- `users.updated_at` / workspace / content tables: `$onUpdate` auto-bump.

## RLS

Row-Level Security is **disabled** on all tables (deliberate). Risk is low: custom schemas (`auth_svc`/`core_svc`) are not exposed via Supabase's PostgREST by default, and services connect as the `postgres` role (not the anon key). Enable RLS later if the anon key is ever used; the `postgres` role bypasses RLS so services keep working.
