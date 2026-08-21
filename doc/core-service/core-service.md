# Core Service (CMS)

NestJS TCP microservice (`:5002`) owning content. Schema: `core_svc`. Handlers are `@MessagePattern`; HTTP routes are exposed by the gateway under `/v1/content/*` (see [API Reference](../api-reference.md)).

## Content model: flexible / headless

Wriven is a **headless CMS** — users define their own content types and fields at runtime. Rather than fixed columns or per-tenant DDL, the model is **content-type registry + JSONB document**:

- A **content type** declares its fields (`fields` jsonb = `FieldDef[]`).
- A **content entry** stores field values in a `data` jsonb, validated app-side against its type's fields.

This means adding a user-chosen field needs **no migration**, scales without per-tenant tables, and leaves entry ids stable for future AI references.

## Schema (`core_svc`)

> **Project-scoped.** `project_id` is the primary scoping key on every content/media table; `workspace_id` is retained as a denormalized uuid for billing-unit queries. All `workspace_id` / `project_id` / `author_id` / `created_by` are plain `uuid` — no FK to `auth_svc` (validated by the gateway). See [Database](../database.md).

**content_types**
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| workspace_id | uuid | denormalized |
| project_id | uuid | NOT NULL; indexed — scoping key |
| name | text | display name |
| api_id | text | machine name (snake_case); `unique(project_id, api_id)` |
| fields | jsonb | `FieldDef[]`, default `[]` |
| created_by | uuid | |
| created_at / updated_at / deleted_at | timestamptz | soft delete |

**content_entries**
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| workspace_id | uuid | denormalized |
| project_id | uuid | NOT NULL; indexed — scoping key |
| content_type_id | uuid | → content_types (cascade) |
| slug | text | `unique(project_id, content_type_id, slug)` |
| status | text | `draft`\|`published`\|`archived` (CHECK), default `draft` |
| data | jsonb | field values keyed by FieldDef.key; GIN-indexed |
| author_id / created_by / updated_by | uuid | |
| published_at | timestamptz | set on first publish |
| created_at / updated_at / deleted_at | timestamptz | `updated_at` auto-bumps; soft delete |

**content_revisions** — `entry_id`→content_entries (cascade), `version` (`unique(entry_id, version)`), `data` jsonb snapshot, `status`, `created_by`, `created_at`. A revision is written on every create, update, **and restore**; restore records a new revision rather than mutating history. Revisions are pruned oldest-beyond-cap to the plan's `revisionsPerEntry` on every write (specs/15).

**media_assets** — project_id (scoping key), denormalized workspace_id, `r2_key` (object key only; `unique(project_id, r2_key)`), `kind` (`image`\|`video`\|`file` CHECK), mime, size_bytes, width, height, alt, original_filename, uploaded_by, created_at, deleted_at.

Also in `core_svc` (see their own specs/diagrams): **api_keys** (plans/01), **webhooks** (specs/04), **support_tickets** + `support_ticket_messages` + `support_ticket_attachments` ([support-ticket/](../support-ticket/)), and **ai_profiles** (per-project AI voice, specs/21). Cross-tenant admin read paths live in `src/admin/`; CDN tag-purge in `src/cache/`.

**usage_buckets** — workspace_id, `period_start` / `period_end` (timestamptz; calendar month, UTC), `request_count` (bigint, default 0), `updated_at`. `unique(workspace_id, period_start)` + index on `workspace_id`. One row per workspace × billing period, atomically incremented (`ON CONFLICT … request_count + n`) by the gateway's batched flush. No FK (auth_svc boundary). See specs/14.

**ai_generations** — workspace_id, project_id, `content_type_id` / `entry_id` (nullable, plain uuid — no FK, so a record survives its target being deleted), target `field_key`/`operation`, a user-scoped `idempotency_key` plus request hash, persisted `output`, model/token totals, prompt version, latency, attempt count, provider request id, finish reason, optional known cost, optional applied revision, `status` (`pending`|`succeeded`|`failed`), error and completion time. `output` and `request_hash` are redacted after the configured retention period; operational metadata remains. On an explicit AI apply followed by Save, core verifies ownership/scope and links the row to the immutable revision. Indexes include `(workspace_id, created_at)`, `(entry_id)`, `(project_id)`, and unique `(workspace_id, created_by, idempotency_key)`. One row per generation — quota reservation, audit trail, safe response replay, and the durable record a future worker queue will use.

## Field types (`FieldDef`)

Defined in `@wriven/contracts` (`cms.types.ts` / `cms.dto.ts`):

```ts
type FieldType = 'text' | 'richtext' | 'number' | 'boolean'
               | 'date' | 'media' | 'select' | 'reference';

interface FieldDef {
  key: string;          // snake_case, used in entry data
  label: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;     // app-enforced: JSONB value check on create/update → CONFLICT 409
  multiple?: boolean;   // array of values (media/reference/select)
  options?: string[];   // for select
  refTypeId?: string;   // for reference → content_types.id
  aiPrivate?: boolean;          // Tier-1 ∧ single-value ∧ not sensitive = AI-eligible (specs/21)
  aiContextFields?: string[];   // opt-in extra context keys under Advanced
}
```

## Validation (`content.validator.ts`)

On create/update, entry `data` is validated against the type's `fields`:
- Unknown keys rejected.
- `required` fields must be present.
- Type checks: text→string, **richtext→ProseMirror doc `{type:'doc',content:[…]}`** (legacy plain strings still accepted), number→number, boolean→boolean, date→ISO string, media/reference→id string, select→one of `options`.
- `multiple` → value must be an array; each item checked.
- Fields marked `unique` are checked against existing JSONB values in the project → `CONFLICT` 409.

Failures throw `VALIDATION_ERROR` (422). DTO shape itself is validated by the gateway's `ValidationPipe` first.

## Operations

| Area | Behavior |
|------|----------|
| Create type | validates unique field keys; `CONFLICT` on duplicate `api_id` |
| Update type | merges name/fields; re-checks unique keys |
| Delete type | soft delete (`deleted_at`) |
| Create entry | loads type → validates data → derives slug (first **text or richtext** field value, else the type name; random-suffixed) unless provided → inserts entry + revision v1; `CONFLICT` on slug clash |
| Update entry | merges `data` over existing, re-validates; sets `published_at` on first publish; writes a new revision (`version = max+1`); **saving an already-published entry re-fires `entry.published`** (webhook + CDN purge) |
| Publish entry | delegates to update(): status→`published`, writes a revision, fires `entry.published` + tag-purge |
| Restore revision | writes a **new** revision with the old version's data (history is immutable) |
| List entries | filters `contentTypeId` / `status`; paginated (`page`, `limit` default 20 / max 100); `total` via `db.$count` |
| Delete entry | soft delete; deleting a published entry fires `entry.deleted` |

All reads scoped by `project_id` and exclude soft-deleted rows.

## Message patterns

`CORE_PATTERNS` in `@wriven/contracts` (`messages.ts`):

- `core.contentType.{create,list,get,update,delete}`
- `core.entry.{create,list,get,update,delete,publish,revisions,revisionRestore}`
- `core.delivery.{list,get}` (public Delivery API)
- `core.media.{presign,create,list,get,delete,deleteBulk,avatarPresign,avatarDelete}`
- `core.webhook.{create,list,update,delete}`
- `core.support.{presign,create,list,get,reply,close}`
- `core.ping`

**API keys** (plans/01): `core.apiKey.{create,list,regenerate,revoke,resolve}`. Tokens are sha-256-hashed at rest; the raw token is returned exactly once from `create`/`regenerate`. `regenerate` rotates the secret in place (same row — name/scope/createdBy kept, `createdAt`/`lastUsedAt` reset); `resolve` is the Delivery-API hot path (hash lookup + fire-and-forget `lastUsedAt`).

**AI generation** (`AI_PATTERNS`, specs/21 — supersedes specs/19 + 20): `core.ai.generate` derives the operation from `(targetKind, intent, preset)`, validates the target (Tier-1, single-value, not sensitive) or assembles `composeFields` for a whole-entry draft, loads the per-project AI voice profile (`ai_profiles`), reserves quota (advisory lock), and calls the injected `AiClient` (HTTP to the standalone `ai-service`). It returns a typed `AiOutput` (`scalar` \| `record`). `core.ai.profile.read`/`profile.update` expose the voice profile. Prompt build, temperature, and `select`/`compose` validate-and-repair live in ai-service; the gateway callers are unchanged. Cost is priced from the returned model (`core/ai/ai-model-prices.ts`).

**Usage metering + stats** (`USAGE_PATTERNS`, specs/14/17): `core.usage.record` (batched atomic increment from the gateway's in-process buffer) · `core.usage.read` (composes the current-period `UsageView`: request count from `usage_buckets` + live media SUM + effective plan limits via `CoreEntitlementsService`) · `core.usage.workspaceStats` / `core.usage.projectStats` (aggregate dashboard counts, specs/17). Limits stay in auth-service; core is the usage authority because it owns the metered resources (api_keys, delivery, media).

## Environment (`apps/core-service/.env`)

```
PORT=5002
DATABASE_URL=...   DIRECT_URL=...     # same Supabase DB, core_svc schema
AUTH_SERVICE_HOST/PORT=               # TCP target for entitlement/limit calls
R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET_NAME=
R2_ENDPOINT= R2_PUBLIC_URL=           # public URL base for key→URL reconstruction
CF_ZONE_ID= CF_API_TOKEN=             # optional Cloudflare CDN tag-purge (no-op if unset)
# AI content generation — runs in ai-service (Python/FastAPI); core calls it over HTTP.
# Provider key (AI_API_KEY etc.) lives in ai-service env, NOT here.
AI_SERVICE_TIMEOUT_MS=35000            # HTTP hop; longer than ai-service provider timeout
AI_SERVICE_URL=http://localhost:8000   # standalone ai-service
INTERNAL_SECRET=                       # must match ai-service INTERNAL_SECRET (authenticates the hop)
AI_GATEWAY_TIMEOUT_MS=                 # overall budget guard for one generation
AI_AUDIT_RETENTION_DAYS=30             # redact AI output/request hash after this period
# Per-model prices come from core/ai/ai-model-prices.ts; these env overrides are the
# LAST-tier fallback (micro-USD / 1M tokens) for models missing from the table.
AI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS=
AI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS=
```

## Not yet built

- **AI image generation** — text generation (single-field + whole-entry compose) shipped in specs/21 (running in ai-service); image gen deferred (different model/cost). It requires its own asset lifecycle, moderation, R2 provenance, and separate job/queue policy; it is intentionally not a variant of text generation.
