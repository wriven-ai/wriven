# Spec: AI Generation Redesign — Typed Output, Entry Composition, Cost Accounting

> Priority: P1 · Area: core · ai · client · contracts · cross · Status: drafted
> **Supersedes** [specs/19 — AI Content Generation](./19-ai-content-generation.md) and
> [specs/20 — AI Service Extraction](./20-ai-service-extraction.md). Both shipped; this
> reshapes what they built. Pre-ship product — breaking contract changes are allowed and
> expected. No customer data migration is required beyond the schema changes listed here.

## Overview

Wriven's AI today is a **field-level writing assistant**: pick one Tier-1 field, run one of
seven verbs, get a `string`, apply it. The plumbing under it (quota atomicity, idempotency,
audit, governance fencing, the `AiClient` seam) is sound and is **kept intact**. What's wrong
is the *model*: a single-scalar output contract (`AiGenerateResult.text: string`) forecloses
multi-field and structured generation, seven co-equal verbs plus four per-field toggles bury
the user in configuration, and token/cost data is written but never read.

This spec makes four structural changes:

1. **Typed output** — `AiOutput` becomes a discriminated union (`scalar` | `option` | `record`)
   so a generation can fill one field, one enum value, or **many fields at once**.
2. **Whole-entry composition** — a new `compose` operation drafts an entire entry from a brief
   (title + body + excerpt coherently), previewed per field and applied selectively. This is
   the capability that makes the product "AI-native" rather than "AI-assisted".
3. **Radical UX simplification** — the content-type builder drops from four AI controls to
   one (`aiPrivate`, "Sensitive"); the editor drops from a 7-verb dropdown + tone input to
   **Generate / Refine(+preset chips) / Draft whole entry**. `aiAssist` and `aiOperations`
   are removed from the contract entirely.
4. **Cost accounting that actually reports** — price resolved from the *returned* model
   (fixing `openrouter/free`, where the model varies per call), period aggregation of tokens
   and spend, and an AI dimension on `UsageView` / `WorkspaceStatsView`.

Plus a set of P0 correctness fixes (gateway timeout, cross-language contract drift, truncation
handling, oversized-input error) found during review.

Provider stays **OpenRouter `openrouter/free`** via the existing OpenAI-compatible seam.
Streaming, embeddings/RAG, async jobs, media/image generation, and token-based plan *limits*
remain out of scope (see "Out of scope" — each is additive on top of this model, not a rewrite
of it).

## Implementation refinements (diverged from the text above)

These are deliberate deviations recorded during build, not scope changes:

- **`AiOutput` is 2 variants, not 3.** The spec described `scalar | option | record`;
  shipped is **`scalar | record`**. A `select` value is just a constrained scalar
  (already validated against `options[]` in ai-service), and folding it into `scalar`
  removes an idempotent-replay reconstruction case (`reconstructOutput` keys only on
  `target_kind`). No client behavior differs between a scalar and an option.
- **`applied_field_keys` is the generated record's keys, not the exact applied subset.**
  The save DTO doesn't carry which fields the author kept, so the entry-save provenance
  link stores the compose's full key set as an honest "what was filled" signal. Making it
  field-exact needs an `aiAppliedFields` map on the entry DTOs — deferred.
- **`promptVersion` is `text-v2`.** Bumped because Phase 4 injects the per-project
  `<voice_guide>` (brand voice / glossary / language) into the system prompt; audit rows
  now attribute output to the post-profile prompt generation. (The `prompt_version`
  *column default* in `core_svc.ai_generations` is still `text-v1` — harmless, since
  finalize always sets the explicit value; left to avoid a third migration.)
- **`aiUsage.unpriced` keys on `total_tokens IS NOT NULL`.** A failed-over-budget row
  (`AI_INPUT_TOO_LARGE`, never reached the provider) has null tokens and null cost; the
  first cut counted it as unpriced and poisoned the period's `cost.complete` flag.
  Requiring non-null tokens keeps `complete` true for all-free periods and only flags
  genuine "provider called but model unpriced" rows.
- **`AiBurstGuard` is route-scoped to `POST /content/ai/generate`.** It was
  controller-level, which throttled profile reads/edits (10/min shared with generations).

## Depends on

- [specs/19 — AI Content Generation](./19-ai-content-generation.md) — `ai_generations` table,
  quota reserve, `AiModule`, gateway route, `AI_GENERATE` permission. ✅ shipped. **Reshaped here.**
- [specs/20 — AI Service Extraction](./20-ai-service-extraction.md) — Python `ai-service`,
  `AiClient` seam, `INTERNAL_SECRET` hop, prompt/temperature/select-retry in Python.
  ✅ shipped. **Extended here.**
- [specs/14 — Usage Metering](./14-usage-metering.md) — `UsageView`, period math
  (`currentPeriod()`), `/usage` route. ✅ shipped. **Extended with an AI dimension.**
- [specs/17 — Workspace Metrics](./17-workspace-metrics.md) — `WorkspaceStatsView.aiText`.
  ✅ shipped. **Extended with tokens + cost.**
- [specs/12 — RBAC](./12-rbac-permissions.md) — `Permission.AI_GENERATE`,
  `Permission.CONTENT_TYPE_MANAGE`. ✅ shipped. Reused unchanged — **no new permissions.**

## Tooling context (skills / MCP / plugins)

No domain tools used. This is an internal redesign of existing TypeScript + Python code
against the same provider surface (OpenRouter, OpenAI-compatible Chat Completions) — no
provider API research needed beyond specs/19. Supabase MCP not used: the schema change is a
normal Drizzle migration owned by core-service (`core_svc`), authored in
`apps/core-service/src/db/schema/index.ts` and generated with `pnpm db:core:generate`.
Checked `libs/shared/contracts` for reusable contracts — `AiTurn`, `AiTokenUsage`,
`AI_PATTERNS`, `UsagePeriod`, and the AI error codes are reused; the new
`AiOutput` / `AiIntent` / `AiTargetKind` / `AiUsageStats` types are added there (never
duplicated in a service). `ai-service` owns no tables and gains no DB access.

## What changes and why

| Area | Today | After | Why |
|---|---|---|---|
| Output | `text: string` | `AiOutput` union: `scalar` \| `option` \| `record` | Unblocks multi-field + structured generation |
| Targets | one field | `field` \| `entry` | Whole-entry drafting is the core AI-CMS job |
| Author actions | 7-verb dropdown + tone input | `generate` \| `refine` + preset chips | 7 co-equal verbs is configuration, not UX |
| Field config | `aiAssist`, `aiOperations`, `aiPrivate`, `aiContextFields` | `aiPrivate` + `aiContextFields` (Advanced) | Only sensitivity is a real decision |
| Prompt | one hardcoded `text-v1` | + per-project brand voice / glossary / language | Prompt *is* the product; must be tunable |
| Cost | written, never read; null by default | resolved per returned model; aggregated; displayed | Data exists, stats don't |

## Scope

- In scope:
  - `AiOutput` discriminated union + `AiGenerateResult.output` replacing `text`.
  - `compose` operation: draft every AI-eligible scalar field of a content type in one call,
    returning `{kind:'record', fields}`. Validated + repaired once in Python.
  - Author-facing collapse to `intent: 'generate' | 'refine'` + optional
    `preset: 'expand'|'shorten'|'rewrite'|'tone'|'summarize'|'continue'`. Server derives the
    stored `operation` from `(targetKind, intent, preset)`; per-operation temperature and
    output-token caps are **kept** (they matter on a weak free model).
  - **Removal** of `FieldDef.aiAssist` and `FieldDef.aiOperations` from contracts, DTO,
    validation, client types, and both UIs. Eligibility is derived: Tier-1 type, not
    `multiple`, not `aiPrivate`.
  - Per-project **AI profile** (`ai_profiles`): brand voice, glossary, default language.
    Loaded by core, injected into the Python system prompt, versioned via `promptVersion`.
  - **Token + cost accounting**: price resolution from the returned model (pattern map,
    `*:free` → 0), period aggregation, `AiUsageStats` on `UsageView` + `WorkspaceStatsView`,
    `cost.complete` honesty flag.
  - P0 hardening: gateway TCP timeout; Pydantic `extra="ignore"` + schema-parity test;
    `truncated` surfaced from `finish_reason === 'length'`; new `AI_INPUT_TOO_LARGE` (422);
    `sourceContent` cap raised 8 000 → 24 000; UTC-consistent period boundary shared by
    quota and stats; `_OPERATION_OUTPUT_TOKEN_CAPS` lookup made non-throwing.
  - Prompt snapshot tests in `ai-service` (prompts are now the source of truth).
  - Doc updates landed with the code.
- Out of scope (explicitly deferred, each additive on this model):
  - **Streaming** to the browser (needs gateway SSE → ai-service, bypassing the TCP hop).
  - **Embeddings / RAG grounding** (pgvector, semantic search, `reference` auto-suggest).
  - **Async job queue** for bulk/long operations (`ai_generations` is already the durable
    hand-off record; `target_kind` + status make the extension mechanical).
  - **Media / image generation** and alt-text.
  - **Translation** as a first-class operation (the AI profile's `language` biases generation
    only; translating an existing entry is a separate op).
  - **Token-based plan limits** — tokens are recorded and reported; enforcement stays
    request-count (`aiTextRequestsPerMonth`).
  - **User-defined custom actions** (the profile is brand voice + glossary + language only).
  - Model routing / multi-model fallback — single `AI_MODEL` remains.
  - Admin-panel platform-wide AI margin view (per-workspace cost is exposed; the console
    surface is a separate spec).

## API / endpoints

### `POST /api/v1/content/ai/generate` (changed, same route + pattern)

Guards unchanged: `JwtAuthGuard, WorkspaceGuard, ProjectGuard, PermissionGuard, AiBurstGuard`
with `@RequirePermission(Permission.AI_GENERATE)`. Pattern `AI_PATTERNS.GENERATE`
(`core.ai.generate`) unchanged.

Request (`AiGenerateDto`) — flattened target (class-validator has no ergonomic discriminated
union; `targetKind` + conditional `fieldKey` keeps validation declarative):

```jsonc
{
  "requestId": "uuid",            // browser-generated idempotency intent
  "contentTypeId": "uuid",
  "entryId": "uuid",              // optional; sibling context + provenance
  "targetKind": "field",          // "field" | "entry"
  "fieldKey": "body",             // required iff targetKind === "field"
  "intent": "refine",             // "generate" | "refine"
  "preset": "shorten",            // optional; only with targetKind:"field" + intent:"refine"
  "instruction": "keep the pricing bullets",
  "sourceContent": "<p>…</p>",    // required for intent:"refine"; ≤ 24 000 chars
  "history": [{ "role": "user", "content": "…" }]   // ≤ 8 turns
}
```

`tone` is **removed** as a field — "change tone" is `preset:'tone'` plus an instruction
(`"more confident"`). One less input, same capability.

Response (`AiGenerateResult`):

```jsonc
{
  "generationId": "uuid",
  "output": { "kind": "scalar", "text": "…" },
  "model": "meta-llama/llama-3.3-70b-instruct:free",
  "usage": { "promptTokens": 120, "completionTokens": 80, "totalTokens": 200 },
  "remaining": 42,
  "truncated": false
}
```

`output` is one of:
- `{ kind: 'scalar', text }` — `text` / `richtext` field.
- `{ kind: 'option', value }` — `select` field; `value ∈ options[]`.
- `{ kind: 'record', fields: { [fieldKey]: string } }` — `targetKind: 'entry'`.

Server-derived `operation` (stored on the audit row, drives prompt + temperature + token cap):

| targetKind | intent | preset | → operation |
|---|---|---|---|
| `entry` | `generate` | — | `compose` |
| `field` | `generate` | — | `generate` |
| `field` | `refine` | set | that preset (`expand`…`continue`) |
| `field` | `refine` | unset | `refine` (freeform instruction) |
| `entry` | `refine` | — | **rejected** `VALIDATION_ERROR` (v1) |

Errors: `PLAN_LIMIT_REACHED` (403), `RATE_LIMITED` (429), `AI_NOT_CONFIGURED` (503),
`AI_QUOTA_UNAVAILABLE` (503), `AI_GENERATION_FAILED` (502, incl. `select` / `compose`
repair-miss), `AI_GENERATION_IN_PROGRESS` (409), `IDEMPOTENCY_KEY_REUSED` (409),
`VALIDATION_ERROR` (422), **`AI_INPUT_TOO_LARGE` (422, new)**.

### `GET` / `PATCH` project AI profile (new)

- `GET /api/v1/content/ai/profile` → `AiProfileView`. Guard: `PermissionGuard` with
  `Permission.CONTENT_TYPE_MANAGE` (project-structure config, no new permission).
- `PATCH /api/v1/content/ai/profile` (`UpdateAiProfileDto`) → `AiProfileView`. Same guard.

Patterns: `AI_PATTERNS.PROFILE_READ = 'core.ai.profile.read'`,
`AI_PATTERNS.PROFILE_UPDATE = 'core.ai.profile.update'`. The generate path loads the profile
**server-side**; the client never has to send it.

### `POST /generate` (ai-service, internal) — extended

Same `X-Internal-Secret` auth, same `{code, message}` error contract. Request gains
`operation` (already derived by core — Python does not re-derive), `targetKind`,
`composeFields[]` (the schema to fill, for `compose`), and `profile`. Response gains
`output` (the union) and keeps `model` / `usage` / `providerRequestId` / `finishReason` /
`attemptCount`.

`GET /health`, `/ready`, `/metrics` unchanged.

### `GET /api/v1/usage` — extended

`UsageView` gains an `ai` block (see contracts). Route, guard, and pattern unchanged.

## Shared contracts (@wriven/contracts)

**`dto/ai.dto.ts`** — reshaped:

```ts
export const AI_TARGET_KINDS = ['field', 'entry'] as const;
export type AiTargetKind = (typeof AI_TARGET_KINDS)[number];

export const AI_INTENTS = ['generate', 'refine'] as const;
export type AiIntent = (typeof AI_INTENTS)[number];

/** Refine shortcuts surfaced as chips. Prefill intent; not separate UI modes. */
export const AI_REFINE_PRESETS = [
  'expand', 'shorten', 'rewrite', 'tone', 'summarize', 'continue',
] as const;
export type AiRefinePreset = (typeof AI_REFINE_PRESETS)[number];

/**
 * Server-derived, persisted on the audit row; selects prompt template,
 * temperature, and output-token cap. KEEP IN SYNC with `OPERATIONS` in
 * apps/ai-service/app/schemas.py (guarded by a parity test).
 */
export const AI_OPERATIONS = [
  'generate', 'compose', 'refine',
  'expand', 'shorten', 'rewrite', 'tone', 'summarize', 'continue',
] as const;
export type AiOperation = (typeof AI_OPERATIONS)[number];

export type AiOutput =
  | { kind: 'scalar'; text: string }
  | { kind: 'option'; value: string }
  | { kind: 'record'; fields: Record<string, string> };

export interface AiGenerateResult {
  generationId: string;
  output: AiOutput;
  model: string;
  usage: AiTokenUsage;
  remaining: number | null;
  /** Provider stopped on the token cap — output is incomplete. */
  truncated?: boolean;
}
```

`AiGenerateDto` (class-validator): `requestId` `@IsUUID`; `contentTypeId`; optional `entryId`;
`targetKind` `@IsIn(AI_TARGET_KINDS)`; optional `fieldKey` `@MaxLength(60)`; `intent`
`@IsIn(AI_INTENTS)`; optional `preset` `@IsIn(AI_REFINE_PRESETS)`; optional `instruction`
`@MaxLength(2000)`; optional `sourceContent` `@MaxLength(24000)`; optional `history`
`@ArrayMaxSize(8)`. `tone` **removed**. Cross-field rules (fieldKey required for `field`,
sourceContent required for `refine`, preset only with `field`+`refine`) are enforced in
`AiService` so the message is domain-specific, not a class-validator dump.

**`types/cms.types.ts`** — `FieldDef`: **delete** `aiAssist` and `aiOperations`. Keep
`aiPrivate` and `aiContextFields`. (Stored JSONB may still contain the removed keys; they are
ignored — no data migration needed.)

**`dto/cms.dto.ts`** — `FieldDefDto`: delete the `aiAssist` / `aiOperations` validators; keep
`aiPrivate` + `aiContextFields`.

**`dto/ai.dto.ts`** — new `AiProfileView` + `UpdateAiProfileDto`:

```ts
export interface AiGlossaryTerm { term: string; prefer: string }
export interface AiProfileView {
  brandVoice: string | null;      // ≤ 2000 chars, free text
  glossary: AiGlossaryTerm[];     // ≤ 50 entries
  language: string | null;        // BCP-47-ish hint, ≤ 20 chars
  updatedAt: string | null;
}
```

**`types/usage.types.ts`** — new `AiUsageStats`, added to `UsageView`:

```ts
export interface AiUsageStats {
  /** Billable generations this period — `succeeded` only. */
  requests: { used: number; limit: number | null };
  /** Provider-reported tokens across `succeeded` AND `failed` — failures burn tokens. */
  tokens: { prompt: number; completion: number; total: number };
  /**
   * Known spend, micro-USD. `complete: false` when ≥1 generation used a model with
   * no price rule — never render a confidently-wrong figure.
   */
  cost: { microusd: number; complete: boolean; unpricedGenerations: number };
}

export interface UsageView {
  period: UsagePeriod;
  requests: { used: number; limit: number | null };
  storage: { usedMb: number; limitMb: number | null };
  ai: AiUsageStats;   // new
}
```

**`types/stats.types.ts`** — `WorkspaceStatsView.aiText` becomes `AiUsageStats` (was
`{used, limit}`), so the dashboard shows tokens + cost beside the count.

**`errors.ts`** — add:

```ts
// Aggregate user-controlled input exceeds the context budget. Actionable, unlike
// the generic AI_GENERATION_FAILED it used to collapse into.
AI_INPUT_TOO_LARGE: { code: 'AI_INPUT_TOO_LARGE', statusCode: 422 },
```

**`messages.ts`** — `AI_PATTERNS` gains `PROFILE_READ` + `PROFILE_UPDATE`.

## Database / schema

Migration `0010` (`core_svc`, Drizzle; `pnpm db:core:generate` → `pnpm db:core:migrate`).

**`ai_generations`** (altered):

| change | reason |
|---|---|
| `field_key` → **nullable** | `compose` targets the whole entry, not one field |
| add `target_kind text NOT NULL DEFAULT 'field'` + CHECK `('field','entry')` | distinguishes field vs entry generations for audit/stats |
| add `applied_field_keys jsonb` (nullable) | which fields of a `compose` record the author actually applied |

Everything else is unchanged — `prompt_tokens`, `completion_tokens`, `total_tokens`,
`cost_microusd`, `model`, `latency_ms`, `attempt_count`, `provider_request_id`,
`finish_reason`, `idempotency_key`, `request_hash`, `output`, `prompt_version`,
`applied_revision_id`, `status`, indexes, and the status CHECK all stay.

**`ai_profiles`** (new — one row per project):

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| workspace_id | uuid NOT NULL | denormalized, indexed |
| project_id | uuid NOT NULL | **unique** — one profile per project |
| brand_voice | text | nullable, ≤ 2 000 chars enforced in DTO |
| glossary | jsonb NOT NULL default `'[]'` | `[{term, prefer}]`, ≤ 50 |
| language | text | nullable |
| updated_by | uuid | |
| created_at / updated_at | timestamptz | `$onUpdate` |

Absent row = empty profile (no brand voice, no glossary, no language). Never auto-created;
`PATCH` upserts.

**No `ai_model_prices` table.** Provider prices are *deployment configuration*, not tenant
data, and they change rarely — a table would add a CRUD surface and an admin UI for no
tenant-visible benefit. Prices live in a static pattern map in core
(`ai/ai-model-prices.ts`), overridable by env. See "Cost accounting" below.

**Period boundary consistency (bug fix).** `ai.service.ts` (quota count) and
`usage.service.ts::aiTextUsed` both use `date_trunc('month', now())`, which resolves in the
DB session timezone, while `currentPeriod()` computes UTC month boundaries. Replace both with
an explicit bound derived from `currentPeriod()` so quota, stats, and billing agree on the
period under any DB timezone.

## Cost accounting

The failure today is not capture — it's **pricing** and **aggregation**.

1. **Price the returned model, not the requested one.** `openrouter/free` resolves to a
   different model per call; core already stores the provider's `res.model`. Resolution order:
   exact match in the price map → longest matching suffix/wildcard rule → env default pair →
   `null`.
2. **`*:free` → 0, not null.** Free is genuinely $0; `null` means *unknown*. Recording 0
   keeps period cost correct today and honest when paid models are added. `AiProfile`-agnostic;
   purely a model-name rule.
3. **Keep the "don't guess" rule.** Unknown model → `cost_microusd = NULL` and the period's
   `cost.complete = false` with `unpricedGenerations > 0`. Never infer a price from a name.
4. **Sum the right statuses.** `requests.used` counts `succeeded` only (existing billing
   semantic, unchanged). `tokens` and `cost` sum `succeeded` **and** `failed` — a failed
   provider call still burned tokens, which is exactly why usage is recorded on failed rows
   (`doc/ai-governance.md`). `pending` rows have null tokens and are excluded.
5. **One query per period**, served by the existing `(workspace_id, created_at)` index:
   `count(*) FILTER (WHERE status='succeeded')`, `sum(prompt_tokens)`,
   `sum(completion_tokens)`, `sum(total_tokens)`, `sum(cost_microusd)`,
   `count(*) FILTER (WHERE cost_microusd IS NULL AND status IN ('succeeded','failed'))`.
   No rollup table — at 50–2 000 generations/workspace/month this is trivial; revisit only
   if volume changes by orders of magnitude.
6. **Retention must not erase financial history.** `redactExpiredAuditData()` nulls only
   `output` + `request_hash` and **must keep** tokens/cost/model/latency. Locked as a rule and
   covered by a test.

## Backend changes

### ai-service (Python / FastAPI)

- **`app/schemas.py`** — `CamelModel` switches to `extra="ignore"` on **request** models
  (forward-compat: a newer core sending an unknown field must not 502 mid-rolling-deploy).
  `GenerateRequest` gains `operation: Operation`, `target_kind`, `compose_fields:
  list[FieldDefIn] | None`, `profile: ProfileIn | None`; drops `tone`. `OPERATIONS` extends to
  the 9-value set. New `ComposeOutput` / `ScalarOutput` / `OptionOutput` response union;
  `GenerateResponse.output` replaces `text`. Validation: `compose` requires
  `compose_fields`; `refine`-family requires `source_content`; aggregate input budget now
  raises a dedicated error mapped to `AI_INPUT_TOO_LARGE`.
- **`app/prompts.py`** — add `compose_prompt()` (emit a JSON object keyed by field key, with
  per-field type/label/options guidance and an explicit "JSON only, no prose" rule) and a
  `refine` freeform template. Inject brand voice + glossary + language from `profile`,
  fenced and truncated like sibling context. `temperature_for` gains `compose` (0.7) and
  `refine` (0.5).
- **`app/generator.py`** — branch on `operation`: scalar path unchanged; `select` keeps
  validate-and-retry-once; **`compose`** parses JSON (tolerant of a stray code fence),
  validates that keys ⊆ requested fields and values are strings, drops unknown keys, requires
  ≥1 valid field, and **repairs once** on failure before raising. Aggregates usage across
  attempts (existing `add_usage`).
- **`app/llm.py`** — `_OPERATION_OUTPUT_TOKEN_CAPS.get(op, settings.ai_max_output_tokens)`
  (no `KeyError` when an operation is added); caps for `compose` (2 400) and `refine` (1 200).
- **`app/exceptions.py`** — add `InputTooLarge` → `422 AI_INPUT_TOO_LARGE`; keep
  `SelectMissError`'s spent-usage passthrough and extend it to compose repair-miss.
- **`tests/`** — add `test_prompts_snapshot.py` (locks the assembled system+user strings per
  operation — prompts are the source of truth now), `test_compose.py` (JSON parse, key
  filtering, repair, miss), and a FastAPI `TestClient` route test with a fake LLM client.

### core-service (NestJS TCP :5002)

- **`src/ai/ai.service.ts`** — derive `operation` from `(targetKind, intent, preset)`;
  validate per the table above (`aiAssist`/`aiOperations` checks **deleted**; eligibility =
  Tier-1 ∧ `!multiple` ∧ `!aiPrivate`). For `compose`, collect all eligible fields of the
  content type as `composeFields` and reject if none. Load the project AI profile and pass it
  through. Persist `target_kind`, nullable `field_key`. Map `truncated` from
  `finishReason === 'length'`. Compute `cost_microusd` via the new price resolver keyed on the
  **returned** model. Replace `date_trunc('month', now())` with the UTC period bound.
- **`src/ai/ai-model-prices.ts`** (new) — pattern→price map + `resolvePrice(model)`:
  exact → longest wildcard (`*:free` → `{0,0}`) → env default → `null`. Pure, unit-tested.
- **`src/ai/ai-profile.service.ts`** (new) — `read(projectId)` / `upsert(...)`; cached
  briefly per project (profile is read on every generation).
- **`src/ai/ai.controller.ts`** — add `PROFILE_READ` / `PROFILE_UPDATE` handlers.
- **`src/ai/ai-client.interface.ts`** — `AiGenerateRequest` gains `operation`, `targetKind`,
  `composeFields?`, `profile?`; drops `tone`. `AiClientResult.output` replaces `text`.
- **`src/ai/ai-service.client.ts`** — pass the new fields; parse the `output` union.
- **`src/usage/usage.service.ts`** — new `aiUsage(workspaceId, period)` returning
  `AiUsageStats` (the single aggregate query); wire into `read()` (`ai` block) and
  `workspaceStats()` (`aiText`). Delete the old count-only `aiTextUsed`.
- **`src/content/content-types.service.ts`** — drop `aiAssist`/`aiOperations` policy branches
  from `assertFieldPolicies`; keep `aiPrivate` + `aiContextFields` rules (context keys must
  exist, be non-sensitive, exclude self).
- **`src/content/entries.service.ts`** — `linkAiGenerationsToRevision` also records
  `applied_field_keys` for `compose` rows. Provenance checks otherwise unchanged.
- **`.env.example`** — document that the cost env pair is now a *fallback* behind the model
  price map; note `*:free` → 0.

### api-gateway

- **`src/content/ai.controller.ts`** — add `.pipe(timeout(AI_GATEWAY_TIMEOUT_MS))` (default
  40 000, i.e. above core's 35 s hop) so a hung generation can't pin a gateway worker; map the
  timeout to `AI_GENERATION_FAILED`. Add the two profile routes (same controller, guarded by
  `CONTENT_TYPE_MANAGE`).
- `AiBurstGuard` unchanged (still in-memory; Redis remains a documented follow-up).

### auth-service

No changes. `aiTextRequestsPerMonth` limits and seeds are unchanged.

## Frontend changes (apps/client)

- **`src/lib/types.ts`** — mirror the contract: delete `aiAssist` / `aiOperations` from
  `FieldDef`; add `AiTargetKind`, `AiIntent`, `AiRefinePreset`, `AiOutput`, `AiUsageStats`,
  `AiProfileView`; fix the stale `aiText: { used: null }` → `AiUsageStats`.
- **`src/lib/api.ts`** — `aiApi.generate` takes the new DTO and returns `output`; add
  `aiApi.getProfile()` / `aiApi.updateProfile()`.
- **Content-type builder** (`…/content-types/page.tsx`) — **remove** the Enable-AI toggle, the
  "Allowed AI actions" checkbox grid (both candidate + per-field), and the inline context grid
  and their state (`candAiAssist`, `candAiOperations`, `aiAssist`, `aiOperations`,
  `defaultAiOperations`, `hasInvalidAiPolicy`, and the related submit guards). **Keep** the
  "Sensitive — never send to AI" toggle. Move "Allowed entry context" into a collapsed
  **Advanced** disclosure per field, default empty. Net: one visible AI control.
- **`src/components/content/ai-panel.tsx`** — replace the operation `<select>` + tone input
  with: an **intent** segmented control (Generate / Refine), **preset chips** for refine
  (Shorten · Expand · Rewrite · Tone · Summarize · Continue) that set `preset` and focus the
  instruction box, and a **"Draft whole entry"** button (`targetKind:'entry'`). Render the
  `output` union: scalar/option as today; **record** as a per-field preview list with an
  include/skip checkbox per field and "Apply selected". Show a "Response was cut off" notice
  when `truncated`. Keep target-field selector, apply modes, undo, multi-turn history,
  alternates, stop-waiting, retry, and the richtext HTML→ProseMirror conversion. Field filter
  becomes `TIER1 ∧ !multiple ∧ !aiPrivate`.
- **`src/components/content/content-editor.tsx`** — `hasAiTarget` drops the `aiAssist` check;
  `onApplied` accepts the applied field keys for `compose`.
- **AI settings surface** — a small per-project "AI voice" panel (brand voice textarea,
  glossary term/prefer rows, language input) reachable from the content-types/settings area,
  gated on `CONTENT_TYPE_MANAGE`.
- **Usage/stats UI** — show AI tokens + cost beside the request count wherever `aiText` is
  rendered; hide the dollar figure (or mark it partial) when `cost.complete === false`.

## Files to create

- `specs/21-ai-generation-redesign.md` (this file)
- `apps/core-service/src/ai/ai-model-prices.ts`
- `apps/core-service/src/ai/ai-profile.service.ts`
- `apps/core-service/src/db/migrations/0010_*.sql` (generated)
- `apps/ai-service/tests/test_compose.py`
- `apps/ai-service/tests/test_prompts_snapshot.py`
- `apps/ai-service/tests/test_generate_route.py`
- `apps/client/src/components/content/ai-profile-panel.tsx`

## Files to modify

- `libs/shared/contracts/src/lib/dto/ai.dto.ts`, `dto/cms.dto.ts`, `types/cms.types.ts`,
  `types/usage.types.ts`, `types/stats.types.ts`, `errors.ts`, `messages.ts`
- `apps/ai-service/app/schemas.py`, `prompts.py`, `generator.py`, `llm.py`, `exceptions.py`
- `apps/core-service/src/ai/ai.service.ts`, `ai.controller.ts`, `ai.module.ts`,
  `ai-client.interface.ts`, `ai-service.client.ts`
- `apps/core-service/src/usage/usage.service.ts`, `usage.controller.ts`
- `apps/core-service/src/content/content-types.service.ts`, `entries.service.ts`
- `apps/core-service/src/db/schema/index.ts`, `apps/core-service/.env.example`
- `apps/api-gateway/src/content/ai.controller.ts`, `apps/api-gateway/src/app/app.module.ts`
- `apps/client/src/lib/api.ts`, `src/lib/types.ts`,
  `src/components/content/ai-panel.tsx`, `content-editor.tsx`,
  `src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/content-types/page.tsx`
- Docs: `doc/status.md`, `doc/core-service/core-service.md`, `doc/ai-governance.md`,
  `doc/api-reference.md`, `doc/database.md`, `doc/README.md`, `CLAUDE.md`

## Files to delete

None. (`aiAssist` / `aiOperations` are field removals inside existing files.)

## New dependencies

None. No new npm or Python packages — the redesign uses the existing `axios`, `openai`,
`pydantic`, TipTap, and TanStack Query surfaces.

## Rules for implementation

Base:
- Shared DTOs/types/patterns/errors live in `libs/shared/contracts` (`@wriven/contracts`) —
  never duplicated in a service. The core→ai-service payload stays a local interface mirrored
  as Pydantic (cross-language, not a NestJS↔NestJS contract).
- Store R2 object **keys** only. (N/A here.)
- Respect service boundaries: `ai-service` owns **no tables** and makes **no DB connections**;
  quota, audit, profile, and cost all stay in core. core→ai is the only NestJS↔non-NestJS HTTP
  hop; all NestJS↔NestJS stays TCP.
- Response envelope `{success,data}` / `{success,error}`; error codes from
  `@wriven/contracts/errors.ts`; never leak stack traces, provider payloads, or DB errors.
- Dot-namespaced patterns from `@wriven/contracts/messages.ts`.
- Frontend and backend changes go in **separate commits**; stage selectively, never
  `git add -A` across both. One-line Conventional Commits, no body, no AI co-author trailer.
- Run tasks through `pnpm nx <target> <project>`.

Feature-specific:
- **The provider key never leaves ai-service.** Unchanged.
- **Preserve every existing correctness property.** The advisory-lock quota reserve, the
  `pending`→`succeeded|failed` flow, stale-reservation reclamation, the
  `(workspace, creator, idempotency_key)` unique + `request_hash` mismatch guard, the
  succeeded-result replay, failed-rows-don't-bill, and provenance linking are all **kept
  byte-for-behavior**. This redesign changes the *shape* of the payload, not the metering
  invariants. A `compose` call is **one** generation = one quota unit, regardless of how many
  fields it fills.
- **Governance is unchanged and still enforced.** `aiPrivate` fields are never a target or a
  context source; sibling context stays opt-in via `aiContextFields`; brand voice/glossary are
  operator-authored config, not CMS content, but are still fenced in the prompt. `compose`
  must skip `aiPrivate` fields when assembling `composeFields`.
- **Retention preserves financial data.** The redaction job may null only `output` and
  `request_hash`. Tokens, cost, model, latency, and finish reason must survive — they are the
  billing and margin record.
- **Cost honesty.** Never guess a model's price. Unknown → `null` → `cost.complete = false`.
  `*:free` → `0` is a fact, not a guess.
- **Status semantics for stats.** `requests` = `succeeded` only; `tokens`/`cost` = `succeeded`
  + `failed`. Do not "simplify" these to one filter.
- **No structured-output reliance on free models.** `compose` and `select` use prompt +
  validate + **one** repair, never `response_format`/tool-use. A second miss →
  `AI_GENERATION_FAILED` (502), row `failed`, **no quota charge**, spent tokens still recorded.
- **Compose is all-or-nothing at the request level.** Partial-but-valid records are accepted
  (unknown keys dropped, ≥1 valid field required); a fully unparseable response fails the
  request. The author then chooses which fields to apply — application is always explicit.
- **AI output is never auto-saved.** Preview → explicit apply → normal entry update →
  revision history. `compose` applies per field, still through the form state.
- **Forward-compatible internal boundary.** Request models use `extra="ignore"` so
  ai-service tolerates a newer core. Deploy order remains ai-service first; the parity test
  covers the operation enum, and a shape test covers the request fields.
- **Prompt parity is now one-directional.** `prompts.py` is the source of truth; the snapshot
  test is what prevents silent regressions. Bump `promptVersion` (`text-v2`) when templates or
  profile injection change, so audit rows attribute output to a prompt generation.
- **Keep per-operation tuning.** On `openrouter/free`, a tight per-verb template plus a
  specific temperature and token cap materially outperforms one generic "refine" prompt. The
  UI collapse is presentational only — the server keeps all nine operations.

## Definition of done

- [ ] `pnpm nx typecheck core-service api-gateway client` — clean.
- [ ] `pnpm nx lint core-service api-gateway client` — clean.
- [ ] `pnpm nx build core-service api-gateway client` — clean.
- [ ] `pnpm db:core:generate` + `pnpm db:core:migrate` — `ai_generations.field_key` nullable,
      `target_kind` + `applied_field_keys` present, `ai_profiles` created.
- [ ] `grep -rn "aiAssist\|aiOperations" apps libs` returns nothing (contract, services, UIs).
- [ ] ai-service tests pass (`compose`, prompt snapshots, route test, existing select-retry,
      contract parity); `AI_OPERATIONS` (TS) === `OPERATIONS` (Python).
- [ ] **Field generate**: `targetKind:'field'`, `intent:'generate'` on a `richtext` field →
      `{output:{kind:'scalar',text}}`, non-zero `totalTokens`.
- [ ] **Refine preset**: `intent:'refine'`, `preset:'shorten'` + `sourceContent` → shorter
      output; `preset` omitted + freeform `instruction` → `operation:'refine'` on the row.
- [ ] **Select**: returns `{kind:'option',value}` with `value ∈ options[]`; double-miss →
      `AI_GENERATION_FAILED` (502), `failed` row, **no** quota charge, tokens recorded.
- [ ] **Compose**: `targetKind:'entry'` → `{kind:'record',fields}` covering ≥1 eligible field,
      **no** `aiPrivate` field present, exactly **one** `ai_generations` row with
      `target_kind:'entry'` and null `field_key`; applying a subset records
      `applied_field_keys` + `applied_revision_id` on save.
- [ ] Unparseable compose JSON → one repair attempt → on second failure
      `AI_GENERATION_FAILED`, `failed` row, no quota charge, aggregated tokens recorded.
- [ ] **Truncation**: a capped response sets `truncated: true` and the panel shows the notice.
- [ ] **Oversized input**: aggregate over budget → `AI_INPUT_TOO_LARGE` (422) with an
      actionable message (not a generic failure).
- [ ] **Cost**: with `AI_MODEL=openrouter/free`, rows record `cost_microusd = 0` (matched by
      the `*:free` rule); an unknown model records `null` and the period reports
      `cost.complete = false` with `unpricedGenerations ≥ 1`.
- [ ] **Stats**: `GET /usage` returns `ai.requests` (succeeded count), `ai.tokens` (succeeded
      + failed sums), `ai.cost`; a deliberately failed generation increases `ai.tokens` but
      **not** `ai.requests`. `WorkspaceStatsView.aiText` shows the same block.
- [ ] Quota unchanged: (N+1)th call → `PLAN_LIMIT_REACHED` (403) with **no** ai-service call;
      reserve still atomic under `pg_advisory_xact_lock`; a `compose` counts as 1.
- [ ] Idempotency unchanged: same `requestId` replays the stored result without a second
      provider call; same key + different input → `IDEMPOTENCY_KEY_REUSED` (409).
- [ ] Period boundary: quota count and `/usage` agree with `currentPeriod()` under a non-UTC
      DB session timezone.
- [ ] Retention: after `AI_AUDIT_RETENTION_DAYS`, `output`/`request_hash` are null while
      tokens, cost, model, latency, and finish reason survive (test-covered).
- [ ] Gateway timeout: a stalled core send returns `AI_GENERATION_FAILED` instead of hanging.
- [ ] Builder shows exactly **one** AI control per field ("Sensitive"), with entry context
      under Advanced; a sensitive field is absent from both the target list and any context.
- [ ] Editor shows Generate / Refine(+chips) / Draft whole entry — no 7-verb dropdown, no
      standalone tone input.
- [ ] AI profile: `PATCH` then generate → brand voice/glossary/language demonstrably affect
      output; profile is never sent by the client on the generate call.
- [ ] `doc/status.md` marks the redesign shipped; `doc/ai-governance.md` documents the cost
      model + retention guarantee; `doc/api-reference.md` reflects the new DTO/result and the
      profile routes; specs/19 + specs/20 are marked superseded by this spec.
