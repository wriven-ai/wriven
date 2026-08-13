# Plan: AI Generation Redesign — Typed Output, Entry Composition, Cost Accounting

> Status: drafted · Executes: [spec 21](../specs/21-ai-generation-redesign.md) ·
> Supersedes: plans/12, plans/13 (their code stays; this reshapes it)

## Goal

Reshape the shipped AI subsystem from a single-scalar field assistant into a typed,
entry-aware generator with real cost reporting and a one-control field UX — without breaking
any existing metering invariant (quota reserve, idempotency/replay, audit, governance,
retention). Provider stays `openrouter/free` via the existing `AiClient` seam. Four
independently shippable phases; the repo is green (typecheck/lint/build) at every commit edge.

## Current state (from code, not docs)

- **Contracts** — `AiGenerateDto` (`requestId, contentTypeId, entryId?, fieldKey, operation,
  instruction?, sourceContent?, tone?, history?`) → `AiGenerateResult{text,model,usage,remaining}`.
  `AI_OPERATIONS` = 7 verbs. `FieldDef` carries `aiAssist`, `aiOperations`, `aiPrivate`,
  `aiContextFields`. `UsageView` has no AI block; `WorkspaceStatsView.aiText = {used,limit}`.
- **core-service** — `ai.service.ts` validates Tier-1 + `aiAssist`/`aiOperations`, reserves
  quota (advisory lock + pending row + idempotency replay + stale reclaim), calls
  `AiClient.generate`, finalizes with tokens + `cost_microusd` (always null: env pair empty),
  `date_trunc('month', now())` for the period. `usage.service.ts::aiTextUsed` counts
  `succeeded` only; `cost_microusd` is **never read anywhere**.
- **ai-service** — `schemas.py` (`extra="forbid"`, `tone`, 7-op `OPERATIONS`), `prompts.py`
  (system/user per op, `temperature_for`), `generator.py` (`select` validate+retry once),
  `llm.py` (`_OPERATION_OUTPUT_TOKEN_CAPS[op]` — throws on unknown op).
- **gateway** — `ai.controller.ts` forwards to `core.ai.generate` with **no `.pipe(timeout)`**;
  `AiBurstGuard` in-memory.
- **client** — builder writes all four AI field flags with an actions grid; `ai-panel.tsx`
  has a 7-op `<select>` + tone input; `content-editor.tsx` gates on `aiAssist`.
- **schema** — `ai_generations.field_key` is `NOT NULL`; no `ai_profiles`.

## Phases

### Phase 1 — Contract reshape + UX simplification + P0 hardening

- **Why here:** foundational and independently valuable — it delivers the UX win the user
  asked for and fixes the correctness bugs, while keeping the response scalar (no output-union
  churn yet). `targetKind:'entry'` is accepted in the type but **rejected** at runtime until
  Phase 3, so nothing half-built ships.
- **Contracts:**
  - `dto/ai.dto.ts` — add `AI_TARGET_KINDS`, `AI_INTENTS`, `AI_REFINE_PRESETS`; extend
    `AI_OPERATIONS` to the 9-value set (`compose`/`refine` added now so Python + core agree,
    even though `compose` is runtime-gated). Reshape `AiGenerateDto`: `targetKind`, optional
    `fieldKey`, `intent`, optional `preset`, `sourceContent` `@MaxLength(24000)`; **remove**
    `tone` and the top-level `operation`. Add optional `truncated` to `AiGenerateResult`.
  - `types/cms.types.ts` + `dto/cms.dto.ts` — **delete** `aiAssist` and `aiOperations`.
  - `errors.ts` — add `AI_INPUT_TOO_LARGE` (422).
- **core-service:**
  - `ai.service.ts` — `deriveOperation(targetKind, intent, preset)`; validation table from the
    spec (`entry`→reject in P1; `refine` needs `sourceContent`; `preset` only `field`+`refine`);
    **delete** `aiAssist`/`aiOperations` checks (eligibility = Tier-1 ∧ `!multiple` ∧
    `!aiPrivate`); pass `operation` + `targetKind` to the client; map `truncated` from
    `finishReason==='length'`; replace `date_trunc('month', now())` with a bound from a shared
    `currentPeriod()` import.
  - `content-types.service.ts` — drop the `aiAssist`/`aiOperations` branches in
    `assertFieldPolicies`; keep `aiPrivate` + `aiContextFields`.
  - `ai-client.interface.ts` / `ai-service.client.ts` — request gains `operation`,
    `targetKind`; drops `tone`.
- **ai-service:** `schemas.py` — `extra="ignore"` on request models; `GenerateRequest` gains
  `operation`, `target_kind`; drops `tone`; `OPERATIONS` → 9 values; raise `InputTooLarge` on
  the aggregate-budget check. `exceptions.py` — `InputTooLarge` → `AI_INPUT_TOO_LARGE`.
  `llm.py` — `_OPERATION_OUTPUT_TOKEN_CAPS.get(op, settings.ai_max_output_tokens)`; add
  `refine` cap. `prompts.py` — add the `refine` template; `temperature_for` handles `refine`.
- **gateway:** `ai.controller.ts` — `.pipe(timeout(AI_GATEWAY_TIMEOUT_MS ?? 40000))` →
  `AI_GENERATION_FAILED` on timeout.
- **client:** `types.ts` (drop the two flags; add new enums; keep scalar result + `truncated`);
  `api.ts` (`aiApi.generate` new DTO); builder page (remove Enable-AI + actions grid + inline
  context; keep Sensitive; context under Advanced); `ai-panel.tsx` (Generate/Refine segmented
  + preset chips, drop the op `<select>` + tone input; **no** compose button yet);
  `content-editor.tsx` (`hasAiTarget` drops `aiAssist`).
- **Shared contracts:** as above.
- **Verify:**
  - `grep -rn "aiAssist\|aiOperations\|\.tone\b" apps/core-service/src apps/client/src libs` →
    only intended residue (none for the two flags).
  - `pnpm nx typecheck lint build core-service api-gateway client` clean;
    `pnpm nx test ai-service` (existing) clean.
  - Field generate/refine end-to-end returns scalar text; `preset:'shorten'` shortens;
    freeform refine stores `operation:'refine'`.
  - `targetKind:'entry'` → `VALIDATION_ERROR` (gated).
  - Oversized `sourceContent`/history → `AI_INPUT_TOO_LARGE` (422), not a generic failure.
  - Stalled core send → gateway returns `AI_GENERATION_FAILED`, no hang.
  - Builder shows one AI control (Sensitive) + Advanced context; editor has no 7-op dropdown.

### Phase 2 — Token + cost accounting + usage/stats surface

- **Why here:** gated on Phase 1's period-bound fix; otherwise fully independent (no schema
  change — the token/cost columns already exist). Directly closes the "written but never read"
  gap the user raised.
- **Files — create:**
  - `apps/core-service/src/ai/ai-model-prices.ts` — `resolvePrice(model): {inPerM,outPerM}|null`:
    exact map → longest wildcard (`*:free` → `{0,0}`) → env default pair → `null`. Seed the
    map with the current free patterns; pure + unit-tested.
  - `apps/core-service/src/ai/ai-model-prices.spec.ts` — exact/wildcard/free/unknown cases.
- **Files — modify:**
  - `ai.service.ts` — `costMicrousd()` uses `resolvePrice(returnedModel)` instead of the single
    global pair; env pair becomes the fallback tier only.
  - `contracts` — `types/usage.types.ts` add `AiUsageStats` + `UsageView.ai`;
    `types/stats.types.ts` change `WorkspaceStatsView.aiText` to `AiUsageStats`.
  - `usage.service.ts` — new `aiUsage(workspaceId, period): AiUsageStats` (one aggregate query:
    `count FILTER succeeded`, token sums over `succeeded+failed`, `sum(cost_microusd)`,
    `count FILTER cost NULL AND status IN (succeeded,failed)` → `unpriced`); wire into `read()`
    (`ai`) and `workspaceStats()` (`aiText`); delete `aiTextUsed`.
  - `.env.example` — document the model price map + `*:free`→0; env pair is fallback.
  - client `types.ts` + usage/stats UI — show tokens + cost; mark/hide `$` when
    `cost.complete === false`.
- **Shared contracts:** `AiUsageStats`, `UsageView.ai`, `WorkspaceStatsView.aiText`.
- **Verify:**
  - `openrouter/free` run → row `cost_microusd = 0`; unknown model → `null` +
    `cost.complete=false`, `unpricedGenerations≥1`.
  - `GET /usage` → `ai.requests` (succeeded), `ai.tokens` (succeeded+failed), `ai.cost`.
  - A forced provider failure raises `ai.tokens` but **not** `ai.requests`.
  - Stats card renders tokens + cost; typecheck/lint/build clean.

### Phase 3 — Typed `AiOutput` union + whole-entry composition

- **Why here:** gated on Phase 1 (reshaped request) and Phase 2 (cost on the compose row).
  This is the mental-model change; it flips the response shape, so it lands as one coherent
  cross-cutting change.
- **Files — modify (schema + migration):**
  - `db/schema/index.ts` — `ai_generations.field_key` nullable; add `target_kind` (NOT NULL
    default `'field'`, CHECK `field|entry`) + `applied_field_keys jsonb`. Generate `0010_*`.
  - `contracts/dto/ai.dto.ts` — add `AiOutput` union; `AiGenerateResult.output` **replaces**
    `text`.
  - `ai-client.interface.ts` / `ai-service.client.ts` — request gains `composeFields?`;
    `AiClientResult.output` replaces `text`.
  - `ai.service.ts` — allow `targetKind:'entry'` → `compose`; assemble `composeFields` from
    eligible fields (skip `aiPrivate`/`multiple`/non-Tier-1); reject empty; persist
    `target_kind` + null `field_key`; map the `output` union through finalize/replay.
  - `entries.service.ts` — `linkAiGenerationsToRevision` records `applied_field_keys` for
    compose rows.
  - ai-service `schemas.py` (`compose_fields`, output union), `prompts.py` (`compose_prompt`,
    `temperature_for('compose')`), `generator.py` (compose JSON parse → key filter → ≥1 valid
    → repair once → `SelectMissError`-style spent-usage passthrough), `llm.py` (`compose` cap).
  - client `types.ts` (`AiOutput`), `ai-panel.tsx` (render union; **Draft whole entry** button;
    record preview with per-field include/skip + Apply selected; `truncated` notice),
    `content-editor.tsx` (`onApplied` carries applied field keys).
- **Files — create:** `apps/ai-service/tests/test_compose.py`,
  `apps/ai-service/tests/test_generate_route.py`.
- **Shared contracts:** `AiOutput`, `AiGenerateResult.output`.
- **Verify:**
  - Field paths still return `scalar`/`option`; migration applies; `field_key` nullable.
  - `targetKind:'entry'` → `{kind:'record',fields}` with ≥1 field, **no** `aiPrivate` field,
    exactly one row `target_kind:'entry'`, null `field_key`, counts as 1 quota unit.
  - Apply a subset → `applied_field_keys` + `applied_revision_id` set on save; provenance
    forgery still rejected.
  - Unparseable compose → one repair → second miss → `AI_GENERATION_FAILED`, `failed` row,
    no charge, tokens aggregated.
  - `truncated` surfaces; `pnpm nx test ai-service` green (compose, route, snapshots).

### Phase 4 — Actions-as-data: per-project AI profile

- **Why here:** last — purely additive; generation works without it (empty profile = today's
  behavior).
- **Files — create:**
  - migration `0011_*` — `ai_profiles` (project-unique; brand_voice, glossary jsonb, language).
  - `apps/core-service/src/ai/ai-profile.service.ts` — `read`/`upsert`, short per-project cache.
  - `apps/client/src/components/content/ai-profile-panel.tsx` — brand voice + glossary + language.
- **Files — modify:**
  - `contracts` — `AiProfileView`, `UpdateAiProfileDto`; `messages.ts` `AI_PATTERNS.PROFILE_READ`
    / `PROFILE_UPDATE`.
  - `ai.controller.ts` (core) — profile handlers; `ai.service.ts` — load profile, pass to client.
  - `ai-client.interface.ts` / `ai-service.client.ts` — request gains `profile?`.
  - ai-service `schemas.py` (`ProfileIn`), `prompts.py` (inject brand voice/glossary/language,
    fenced + truncated); bump `promptVersion` → `text-v2`.
  - gateway `ai.controller.ts` — `GET`/`PATCH /content/ai/profile` (`CONTENT_TYPE_MANAGE`).
  - client `api.ts` (`getProfile`/`updateProfile`), settings surface mount.
- **Shared contracts:** `AiProfileView`, `UpdateAiProfileDto`, two patterns.
- **Verify:**
  - `PATCH` then generate → brand voice/glossary/language demonstrably shift output; client
    never sends the profile on generate; `promptVersion='text-v2'` on new rows.
  - Empty/absent profile → unchanged output; typecheck/lint/build + ai-service tests clean.

## Risks / open questions

- **Response-shape flip (Phase 3).** `text`→`output` is breaking. Mitigation: it lands in one
  phase across contracts + core + python + client; Phases 1–2 keep scalar `text` so the repo
  is shippable before the flip.
- **Compose JSON reliability on free models.** Mitigation: tolerant parse (strip fences),
  drop unknown keys, require ≥1 valid field, one repair, then fail with no charge — the exact
  discipline already proven for `select`.
- **Deploy ordering.** `extra="ignore"` (Phase 1) makes ai-service tolerate a newer core;
  still deploy ai-service first. Parity test covers the op enum; a shape test covers request
  fields.
- **Cost-map staleness.** Prices drift; the map is code + env fallback, and `cost.complete`
  surfaces any unpriced model rather than guessing. A price table/admin UI stays a later spec.
- **Stats query cost.** One aggregate over `(workspace_id, created_at)` per period — trivial at
  current volumes; add a rollup only if generation volume grows by orders of magnitude.
- **Burst guard still in-memory.** Unchanged here; Redis remains a separate follow-up.

## Out of scope

Streaming; embeddings/RAG; async job queue; media/image gen + alt-text; translation op;
token-based plan *limits*; user-defined custom actions; model routing; admin-panel platform
AI margin view. (Each is additive on this model — see spec 21.)

## Definition of done

Mirrors spec 21's DoD; each item maps to a phase Verify above. Ship gate per phase:
`pnpm nx typecheck lint build core-service api-gateway client` clean +
`pnpm nx test ai-service` clean + the phase's functional checks, committed as separate
frontend/backend Conventional Commits with no AI co-author trailer. Docs (`doc/status.md`,
`doc/ai-governance.md`, `doc/api-reference.md`, `doc/core-service/core-service.md`,
`doc/database.md`, `CLAUDE.md`) land with the phase that changes the behavior they describe;
specs/19 + specs/20 marked superseded by specs/21.
