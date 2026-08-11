# Core Service (CMS)

NestJS TCP microservice (`:5002`) owning content. Schema: `core_svc`. Handlers are `@MessagePattern`; HTTP routes are exposed by the gateway under `/api/v1/content/*` (see [API Reference](../api-reference.md)).

## Content model: flexible / headless

Wriven is a **headless CMS** — users define their own content types and fields at runtime. Rather than fixed columns or per-tenant DDL, the model is **content-type registry + JSONB document**:

- A **content type** declares its fields (`fields` jsonb = `FieldDef[]`).
- A **content entry** stores field values in a `data` jsonb, validated app-side against its type's fields.

This means adding a user-chosen field needs **no migration**, scales without per-tenant tables, and leaves entry ids stable for future AI references.

## Schema (`core_svc`)

> All `workspace_id` / `author_id` / `created_by` are plain `uuid` — no FK to `auth_svc` (validated by the gateway). See [Database](../database.md).

**content_types**
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| workspace_id | uuid | indexed |
| name | text | display name |
| api_id | text | machine name (snake_case); `unique(workspace_id, api_id)` |
| fields | jsonb | `FieldDef[]`, default `[]` |
| created_by | uuid | |
| created_at / updated_at / deleted_at | timestamptz | soft delete |

**content_entries**
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| workspace_id | uuid | indexed |
| content_type_id | uuid | → content_types (cascade) |
| slug | text | `unique(workspace_id, content_type_id, slug)` |
| status | text | `draft`\|`published`\|`archived` (CHECK), default `draft` |
| data | jsonb | field values keyed by FieldDef.key; GIN-indexed |
| author_id / created_by / updated_by | uuid | |
| published_at | timestamptz | set on first publish |
| created_at / updated_at / deleted_at | timestamptz | `updated_at` auto-bumps; soft delete |

**content_revisions** — `entry_id`→content_entries (cascade), `version` (`unique(entry_id, version)`), `data` jsonb snapshot, `status`, `created_by`, `created_at`. A revision is written on every create and update.

**media_assets** — workspace_id, `r2_key` (object key only; `unique(workspace_id, r2_key)`), `kind` (`image`\|`video`\|`file` CHECK), mime, size_bytes, width, height, alt, original_filename, uploaded_by, created_at, deleted_at.

**usage_buckets** — workspace_id, `period_start` / `period_end` (timestamptz; calendar month, UTC), `request_count` (bigint, default 0), `updated_at`. `unique(workspace_id, period_start)` + index on `workspace_id`. One row per workspace × billing period, atomically incremented (`ON CONFLICT … request_count + n`) by the gateway's batched flush. No FK (auth_svc boundary). See specs/14.

**ai_generations** — workspace_id, project_id, `content_type_id` / `entry_id` (nullable, plain uuid — no FK, so a record survives its target being deleted), `field_key`, `operation`, `model`, `prompt_tokens` / `completion_tokens` / `total_tokens` (nullable int), `status` (`pending`|`succeeded`|`failed`, default `pending`), `error`, `created_by`, `created_at`. Indexes `(workspace_id, created_at)` + `(entry_id)` + `(project_id)`. One row per generation — meters usage (row-count of `pending`+`succeeded` vs `aiTextRequestsPerMonth`, reserved atomically via `pg_advisory_xact_lock`) + audits + stores token totals. See specs/19.

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
  unique?: boolean;     // declared; not yet enforced
  multiple?: boolean;   // array of values (media/reference/select)
  options?: string[];   // for select
  refTypeId?: string;   // for reference → content_types.id
}
```

## Validation (`content.validator.ts`)

On create/update, entry `data` is validated against the type's `fields`:
- Unknown keys rejected.
- `required` fields must be present.
- Type checks: text/richtext→string, number→number, boolean→boolean, date→ISO string, media/reference→id string, select→one of `options`.
- `multiple` → value must be an array; each item checked.

Failures throw `VALIDATION_ERROR` (422). DTO shape itself is validated by the gateway's `ValidationPipe` first.

## Operations

| Area | Behavior |
|------|----------|
| Create type | validates unique field keys; `CONFLICT` on duplicate `api_id` |
| Update type | merges name/fields; re-checks unique keys |
| Delete type | soft delete (`deleted_at`) |
| Create entry | loads type → validates data → derives slug (from first text field, random-suffixed) unless provided → inserts entry + revision v1; `CONFLICT` on slug clash |
| Update entry | merges `data` over existing, re-validates; sets `published_at` on first publish; writes a new revision (`version = max+1`) |
| Publish entry | shortcut: status→`published` |
| List entries | filters `contentTypeId` / `status`; paginated (`page`, `limit` default 20 / max 100); `total` via `db.$count` |
| Delete entry | soft delete |

All reads scoped by `workspace_id` and exclude soft-deleted rows.

## Message patterns

`core.contentType.{create,list,get,update,delete}` · `core.entry.{create,list,get,update,delete,publish}` · `core.ping`. Defined as `CORE_PATTERNS` in `@wriven/contracts`.

**AI generation** (`AI_PATTERNS`, specs/19): `core.ai.generate` — the `AiModule` handler calls the injected `AiProvider` (generic OpenAI-compatible impl: any OpenAI-compat endpoint via env). Runs in-process so it can be extracted to `ai-service` later by swapping the provider impl for an HTTP client; the pattern + gateway callers stay unchanged.

**Usage metering** (`USAGE_PATTERNS`, specs/14): `core.usage.record` (batched atomic increment from the gateway's in-process buffer) · `core.usage.read` (composes the current-period `UsageView`: request count from `usage_buckets` + live media SUM + effective plan limits via `CoreEntitlementsService`). Limits stay in auth-service; core is the usage authority because it owns the metered resources (api_keys, delivery, media).

## Environment (`apps/core-service/.env`)

```
PORT=5002
DATABASE_URL=...   DIRECT_URL=...     # same Supabase DB, core_svc schema
R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET_NAME=
# AI content generation (in-process AiModule; generic OpenAI-compatible Chat Completions):
AI_API_KEY=                            # provider key (OpenRouter/OpenAI/Groq…), core only
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openrouter/free
AI_TIMEOUT_MS=30000
AI_HEADERS=                            # optional JSON of extra provider headers
# Used only AFTER extraction to the standalone FastAPI ai-service:
AI_SERVICE_URL=http://localhost:8000   # deferred — unused while AI gen is in-process
INTERNAL_SECRET=                       # must match ai-service when extracted
```

## Not yet built

- **AI image generation** — Tier-1 text/richtext/select generation shipped (specs/19); image gen deferred (different model/cost).
- **Per-field `aiAssist` builder toggle** — `FieldDef.aiAssist` is enforced server-side; the content-type builder UI toggle is pending.
- **Extraction to `ai-service`** — the `AiProvider` seam keeps this a later one-file swap (provider impl → HTTP client).
