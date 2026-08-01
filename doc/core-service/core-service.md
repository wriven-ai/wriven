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

## Environment (`apps/core-service/.env`)

```
PORT=5002
DATABASE_URL=...   DIRECT_URL=...     # same Supabase DB, core_svc schema
R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET_NAME=
AI_SERVICE_URL=http://localhost:8000  # planned
INTERNAL_SECRET=                       # must match ai-service (planned)
```

## Not yet built

- **Media upload** — `media_assets` exists; needs R2 presign/upload endpoints + ImageKit URL building.
- **Reference resolution** — stored as ids; no populate/expand.
- **Unique-field enforcement** — `FieldDef.unique` declared but not enforced (needs a JSONB expression index or query check).
- **Default content type seeding** on workspace creation.
- **AI generation** — future `ai_generations` table will reference `content_entries.id`.
