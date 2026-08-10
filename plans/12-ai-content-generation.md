# Plan: AI Content Generation

> Status: drafted · Executes: spec 19 (`specs/19-ai-content-generation.md`) · Supersedes: -

## Goal

Ship Tier-1 AI field generation (`text` / `richtext` / `select`) inside core-service via an
OpenRouter-backed `AiProvider`, with multi-turn refinement, hard plan-quota enforcement, and an
editor UI — built on an extraction seam so it can move to the deferred `ai-service` later.

## Current state

- **Plan limits exist + are resolved**: `PlanLimits.aiTextRequestsPerMonth` (50/500/2000) +
  `aiImageRequestsPerMonth` seeded in `apps/auth-service/src/db/seed.ts`; resolved over TCP via
  `AUTH_PATTERNS.ENTITLEMENTS_RESOLVE` and consumed by `CoreEntitlementsService` (cached, fail-open).
- **`CoreEntitlementsService`** already exposes the `assertXQuota()` pattern (`assertEntryQuota`,
  `assertContentTypeQuota`, …) — count own resources + throw `PLAN_LIMIT_REACHED`. AI quota mirrors it.
- **Metering pattern exists** (specs/14): `usage.service.record()` atomic-increments `usage_buckets`.
  AI metering uses a dedicated `ai_generations` table (row-count = requests, + token totals + audit).
- **Gateway guard stack wired**: `ContentController` uses
  `@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard, PermissionGuard)` + per-route
  `@RequirePermission(...)`. `Permission.CONTENT_ENTRY_UPDATE` is the content-write tier — reuse it.
- **Editor AI chat panel UI** exists but has no backend (`doc/market-readiness.md`). Content API client
  is `contentApi` in `apps/client/src/lib/api.ts`; editor lives under `apps/client/src/components/editor`,
  content-type builder under `apps/client/src/components/sidebar/builders`.
- **Schema** is a single file: `apps/core-service/src/db/schema/index.ts` (`coreSchema.table(...)`).
- **NOT done**: any AI module, the `ai_generations` table, `AI_PATTERNS`, the route, the UI wiring.

## Phases

### Phase 1 — Shared contracts

- **Why here** — first; every other phase imports from `@wriven/contracts`.
- **Files — create:** `libs/shared/contracts/src/lib/dto/ai.dto.ts` — `AiGenerateDto`
  (class-validator: `contentTypeId`, `entryId?`, `fieldKey`, `operation: AiOperation`,
  `instruction?`, `history?: AiTurn[]`, `tone?`), `AiTurn` (`{ role: 'user'|'assistant'; content: string }`),
  `AiOperation` union, `AiGenerateResult` view (`{ text, model, usage, remaining }`).
- **Files — modify:**
  - `libs/shared/contracts/src/lib/types/cms.types.ts` — add `aiAssist?: boolean` to `FieldDef`.
  - `libs/shared/contracts/src/lib/messages.ts` — add `AI_PATTERNS = { GENERATE: 'core.ai.generate' }`.
  - `libs/shared/contracts/src/lib/errors.ts` — add `AI_GENERATION_FAILED: { code, statusCode: 502 }`
    and `AI_NOT_CONFIGURED: { code, statusCode: 503 }` (missing `OPENROUTER_API_KEY`, not a boot failure).
  - `libs/shared/contracts/src/index.ts` — barrel `export * from './lib/dto/ai.dto'`.
- **Shared contracts:** all of the above (this *is* the contracts phase).
- **Verify:** `pnpm nx typecheck @wriven/contracts` — clean (project name is the package name
  `@wriven/contracts`; there is no `shared-contracts` Nx project). If the lib has no typecheck target,
  `pnpm nx typecheck core-service api-gateway client` covers it (they all import `@wriven/contracts`).
  New symbols importable from `@wriven/contracts`.

### Phase 2 — Schema (`ai_generations`)

- **Why here** — provider/service need the table to persist + meter; gated on Phase 1 (no contract dep,
  but keeps the backend phase single-focused). Independent of Phase 1 in code, but ordered here.
- **Files — modify:** `apps/core-service/src/db/schema/index.ts` — add `aiGenerations` table
  (`coreSchema.table('ai_generations', {...})`) per spec columns: `id`, `workspaceId`, `projectId`,
  `contentTypeId?`, `entryId?`, `fieldKey`, `operation`, `model`, `promptTokens`, `completionTokens`,
  `totalTokens`, `status` (`pending|succeeded|failed` CHECK), `error?`, `createdBy`, `createdAt`; indexes
  `(workspace_id, created_at)` + `(entry_id)`. Add `aiGenerationsRelations` if relations are used elsewhere.
- **Shared contracts:** none.
- **Verify:**
  - `pnpm db:core:generate` — generates a new migration adding `ai_generations`.
  - `pnpm db:core:migrate` — applies it.
  - Confirm table present: `pnpm db:core:studio` (or `\dt core_svc.ai_generations`).

### Phase 3 — Core `AiModule` (provider seam + service + TCP handler)

- **Why here** — the feature core; gated on Phase 1 (contracts) + Phase 2 (table).
- **Files — create:** `apps/core-service/src/ai/`
  - `ai-provider.interface.ts` — `AiProvider.generate(input): Promise<{ text; usage: {promptTokens;completionTokens;totalTokens}; model }>`. **The extraction seam** — no SDK types leak out.
  - `providers/openrouter.provider.ts` — `@Injectable()` impl using the `openai` SDK:
    `new OpenAI({ apiKey: OPENROUTER_API_KEY, baseURL: OPENROUTER_BASE_URL, timeout: AI_TIMEOUT_MS,
    defaultHeaders: { 'HTTP-Referer': AI_REFERER, 'X-OpenRouter-Title': 'Wriven' } })` (current header
    name; `X-Title` still accepted). Calls `chat.completions.create({ model: AI_MODEL, messages,
    temperature })` where `temperature` comes from the operation (default `0.7`; `0.2`–`0.3` for
    `rewrite`/`select`). Returns the **actual** model from `response.model` (may differ from
    `AI_MODEL` for `openrouter/free`) + `response.usage`. Catches provider errors → rethrow as a typed
    `AiProviderError` (status, message). If `OPENROUTER_API_KEY` is unset → throws a typed error the
    service maps to `AI_NOT_CONFIGURED` (503) (never boot-fail). **Only file that imports `openai`**.
  - `ai-prompt.ts` — system prompt + per-`operation` templates (generate/expand/shorten/rewrite/tone/
    summarize/continue) + tone injection + context assembly (content type name, field label, sibling
    field values from the entry when `entryId` given). `select` prompt forces choice from `options[]`.
    **Prompt-injection mitigation:** sibling field values are user-controlled — delimit them inside clear
    fences as **data** in the system prompt and instruct the model to treat entry context as untrusted
    data, never as instructions.
  - `ai.service.ts` — orchestrates: load content type → validate `fieldKey` is Tier-1 + `aiAssist !== false`
    (else `VALIDATION_ERROR`) → **atomic quota reserve** in one txn: `pg_advisory_xact_lock(hashtext(workspaceId))`
    → `INSERT` a `pending` `aiGenerations` row → `CoreEntitlementsService.assertAiTextQuota` counts
    `status IN ('pending','succeeded')` in-period and throws `PLAN_LIMIT_REACHED` (→ rollback + delete
    pending) if over; returns `{ remaining }` → commit the pending row → assemble `messages[]` (system +
    `history` + instruction) → `provider.generate` → for `select`, validate `text ∈ options[]`, retry once
    on miss; **retry-miss → finalize the row `failed` + throw `AI_GENERATION_FAILED` (no quota charge,
    since failed rows don't count)** → on success finalize `succeeded` + tokens → return `AiGenerateResult`
    with `remaining`. Never throws raw provider text.
  - `ai.controller.ts` — `@MessagePattern(AI_PATTERNS.GENERATE)` handler; pulls `workspaceId/projectId/
    userId/dto` from payload; delegates to `AiService`.
  - `ai.module.ts` — `imports: [CoreEntitlementsModule, DatabaseModule]`, `providers: [AiService,
    { provide: 'AI_PROVIDER', useClass: OpenRouterAiProvider }]`, `controllers: [AiController]`.
- **Files — modify:**
  - `apps/core-service/src/app/app.module.ts` — add `AiModule` to `imports: [...]`.
  - `apps/core-service/src/entitlements/core-entitlements.service.ts` — add `aiGenerations` to the
    `schema` destructure, then `async assertAiTextQuota(workspaceId: string): Promise<{ remaining: number | null }>`
    mirroring `assertEntryQuota`: resolve `limits(workspaceId)?.aiTextRequestsPerMonth`; if `null` →
    `{ remaining: null }` (unmetered); else count `ai_generations` rows in the current calendar month
    with `status IN ('pending','succeeded')` (reservation-aware — the caller has already inserted its
    `pending` row under `pg_advisory_xact_lock` in the same txn); if count > limit → throw
    `rpcError('PLAN_LIMIT_REACHED', …)`; else `{ remaining: limit - (count - 1) }` (exclude the just-inserted
    pending row from remaining). **Hard-enforce** — do not adopt the fail-open write policy.
  - `apps/core-service/src/usage/usage.service.ts` — in `read()` (UsageView composition), set
    `aiText.used` = in-period count of `ai_generations` with `status='succeeded'`, and `aiText.limit`
    from the resolved `aiTextRequestsPerMonth`. Single source of truth — no `usage_buckets` write.
  - `apps/core-service/.env` + `apps/core-service/.env.example` — add `OPENROUTER_API_KEY`,
    `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`, `AI_MODEL=openrouter/free`,
    `AI_TIMEOUT_MS=30000`, `AI_REFERER=https://wriven.tech`.
- **Shared contracts:** consumes `AI_PATTERNS`, `AiGenerateDto`, `AiGenerateResult`,
  `ERROR_CODES.AI_GENERATION_FAILED` (Phase 1).
- **Verify:**
  - `pnpm nx typecheck core-service` — clean.
  - `pnpm nx build core-service` — clean.
  - `pnpm nx lint core-service` — clean.

### Phase 4 — Gateway HTTP route

- **Why here** — exposes the feature; gated on Phase 3 (the TCP handler must exist).
- **Files — create:**
  - `apps/api-gateway/src/content/ai.controller.ts` — `@Controller('content/ai')`,
    `@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard, PermissionGuard, AiBurstGuard)`
    (class-level, matching `ContentController` + the burst guard). Method `@Post('generate')`,
    `@RequirePermission(Permission.CONTENT_ENTRY_UPDATE)`, body `AiGenerateDto`; reads `workspaceId` /
    `projectId` from the request scope (set by guards) + `userId` from `req.user`; calls
    `this.core.send(AI_PATTERNS.GENERATE, { workspaceId, projectId, userId, dto })` and returns via the
    envelope interceptor.
  - `apps/api-gateway/src/content/ai-burst.guard.ts` — per-workspace sliding-window throttle (~10 req/min,
    in-memory map keyed by `workspaceId`) applied only to the AI route. Over the window →
    `RATE_LIMITED` (429). The monthly quota stops long-term abuse; this stops one workspace exhausting
    the shared `OPENROUTER_API_KEY`'s ~20 RPM and degrading AI platform-wide. (In-memory is fine —
    single gateway instance; revisit if horizontally scaled.)
- **Files — modify:** `apps/api-gateway/src/app/app.module.ts` — add `AiController` to the
  `controllers: [...]` array (gateway has no per-feature modules; all controllers register here, like
  `MediaController`).
- **Shared contracts:** consumes `AI_PATTERNS`, `AiGenerateDto`.
- **Verify:**
  - `pnpm nx typecheck api-gateway` — clean.
  - `pnpm nx build api-gateway` — clean.
  - `pnpm nx lint api-gateway` — clean.

### Phase 5 — Backend manual smoke (real key)

- **Why here** — proves the chain end-to-end before any UI; gated on Phases 3–4.
- **Files — create:** none.
- **Files — modify:** none.
- **Shared contracts:** none.
- **Verify:** run `pnpm dev:core` + `pnpm dev:gateway` with a real `OPENROUTER_API_KEY`. With a valid
  access token + `X-Workspace-Id` + `X-Project-Id`:
  - `POST /api/v1/content/ai/generate` `{ contentTypeId, fieldKey:<richtext field>, operation:'generate' }`
    → `200 { success:true, data:{ text, model, usage, remaining } }`.
  - Multi-turn: second call with `history:[{user,…},{assistant,…}]` + `instruction:'shorten'` → shorter text.
  - `select` field: returned `text ∈ options[]`; force a miss (options the model won't emit) → retry →
    still missing → `502 AI_GENERATION_FAILED`, a `failed` row, **no** quota charge.
  - Burst throttle: 11th call in a minute from one workspace → `429 RATE_LIMITED`.
  - Unconfigured: unset `OPENROUTER_API_KEY`, restart core → route returns `503 AI_NOT_CONFIGURED`,
    core still boots, non-AI routes fine.
  - Quota: lower `aiTextRequestsPerMonth` for the test workspace below current usage → next call →
    `403 { success:false, error:{ code:'PLAN_LIMIT_REACHED' } }`, **no** provider call (no new row).
  - Failure: set `AI_MODEL=<garbage>` → `502 { code:'AI_GENERATION_FAILED' }`, no provider payload in body,
    a `failed` `ai_generations` row recorded.
  - Guard: `fieldKey` of a `number`/`date`/`media`/`reference` field, or `aiAssist:false` → `422 VALIDATION_ERROR`.
  - Auth: no token → `401`; non-member workspace → `403`.

### Phase 6 — Frontend (apps/client)

- **Why here** — gated on the working backend; **separate commit** from backend (CLAUDE.md rule).
- **Files — create:** `apps/client/src/features/content/ai/` (or under `components/editor/ai/` to match
  existing layout):
  - `useAiGenerate.ts` — TanStack Query `useMutation` calling `aiApi.generate(dto)`; holds in-memory
    `messages[]` (local state), caps at last ~8 turns sent; exposes `{ generate, isPending, error, preview }`.
  - `AiPanel.tsx` — wires the existing editor AI chat panel: freeform instruction input + operation
    buttons (Generate/Expand/Shorten/Rewrite/Tone/Summarize/Continue); shows returned `text` as a preview;
    Insert / Replace buttons write into the active field's form state (no save yet).
  - `AiFieldAction.tsx` — the ✨ control rendered on `text`/`richtext`/`select` fields where
    `field.aiAssist !== false`; opens the panel scoped to that field.
- **Files — modify:**
  - `apps/client/src/lib/api.ts` — add `aiApi.generate(dto)` (`POST /content/ai/generate`) next to
    `contentApi`; add the `AiGenerate*` types import from `@wriven/contracts`.
  - Content-type builder (`apps/client/src/components/sidebar/builders/*`) — add an "Allow AI assist"
    toggle per field; write `aiAssist`; default **on** for `text`/`richtext`/`select`, off otherwise.
  - Content editor (`apps/client/src/components/editor/*`) — mount `<AiPanel />` + `<AiFieldAction />`
    on Tier-1 fields.
- **Shared contracts:** consumes `AiGenerateDto`, `AiGenerateResult`, `FieldDef.aiAssist`, `AiOperation`.
- **Verify:**
  - `pnpm nx typecheck client` — clean.
  - `pnpm nx build client` — clean.
  - `pnpm nx lint client` — clean.
  - Manual: open editor → ✨ on a richtext field → Generate → preview → Insert → save entry → History
    drawer shows the new revision; ✨ hidden on a `number` field; toggle off `aiAssist` → ✨ disappears.

### Phase 7 — Docs

- **Why here** — last; code is source of truth, docs follow.
- **Files — modify:**
  - `doc/status.md` — mark AI generation Tier-1 rows ✅ (the section this spec repurposed in the earlier
    doc update).
  - `doc/core-service/core-service.md` — move AI generation out of "Not yet built"; add `ai_generations`
    to the schema section + `AI_PATTERNS` to message patterns.
- **Shared contracts:** none.
- **Verify:** doc review — no stale "unbuilt" / "skeleton" AI references remain for Tier 1.

## Risks / open questions

- **Shared-key rate limit.** All users share one `OPENROUTER_API_KEY`; the free pool caps at ~20 req/min
  + 50–1000/day at the **key** level. Under load the upstream 429 can bite before the per-user 50 does.
  Mitigation in-plan: per-workspace burst throttle (~10/min → `RATE_LIMITED`) caps one workspace's blast
  radius, and upstream 429 maps to `AI_GENERATION_FAILED` (502). Real fix later: move `AI_MODEL` to a
  paid model (per-key limits) — the seam makes this a one-line env change.
- **Free-model output quality + inconsistency.** `openrouter/free` picks a random model per call →
  inconsistent tone/format. Accepted for MVP; document that `AI_MODEL` can be pinned to a single
  `:free` model for consistency.
- **`select` reliability.** Free models can't do structured output → prompt + validate + one retry.
  If miss-rate is high in smoke, tighten the prompt or pin a stronger `:free` model for `select` only.
- **Hard vs soft quota.** Plan hard-enforces `aiTextRequestsPerMonth` (403 before the provider call).
  If free-tier friction is too high at launch, switch `assertAiTextQuota` to soft (warn, allow) — but
  that risks cost; keep hard unless explicitly changed.
- **Token-based limits deferred.** Schema stores token totals; enforcement stays request-count
  (`aiTextRequestsPerMonth`). Switching to token-based is a later change to `assertAiTextQuota` only.
- **Timeout vs long gens.** 30s `AI_TIMEOUT_MS` may clip long richtext generations on slow free models.
  Tune up if smoke shows truncation; phase-2 streaming removes the bound.

## Out of scope

- Image generation (`media` field), `reference` RAG, `number`/`boolean`/`date` generation.
- Streaming to the browser (SSE/WebSocket at the gateway).
- Token-based plan limits; persisting conversation history to the DB.
- Extraction to the standalone FastAPI `ai-service` (the `AiProvider` seam preserves it for a later plan).
- Per-workspace model selection (letting users pick the model) — env-global `AI_MODEL` only for now.

## Definition of done

Mirrors spec DoD; each item maps to a phase Verify:

- [ ] (P1) Contracts: `FieldDef.aiAssist`, `AI_PATTERNS`, `AI_GENERATION_FAILED`, `AI_NOT_CONFIGURED`,
  `AiGenerateDto`/result exported from `@wriven/contracts`; `pnpm nx typecheck @wriven/contracts` clean.
- [ ] (P2) `ai_generations` exists in `core_svc` after `db:core:generate` + `db:core:migrate`.
- [ ] (P3) `typecheck` + `build` + `lint` core-service clean.
- [ ] (P4) `typecheck` + `build` + `lint` api-gateway clean.
- [ ] (P5) Smoke: generate → `{ text, model, usage, remaining }`; multi-turn shortens; `select` ∈ options
  + retry-miss → `AI_GENERATION_FAILED`/failed row/no charge; burst >10/min → `RATE_LIMITED`; unconfigured →
  `AI_NOT_CONFIGURED` (503) with core still booting; quota → `PLAN_LIMIT_REACHED` with no provider call
  (atomic — pending row + advisory lock); bad model → `AI_GENERATION_FAILED` (502, no leak) + failed row;
  wrong field type / `aiAssist:false` → `VALIDATION_ERROR`; auth/member guards enforce; `/usage` `aiText.used`
  reflects succeeded generations.
- [ ] (P6) `typecheck` + `build` + `lint` client clean; editor ✨ on Tier-1 fields only, preview→Insert→save
  writes a revision; builder AI toggle defaults correctly.
- [ ] (P7) `doc/status.md` + `doc/core-service/core-service.md` mark Tier-1 AI ✅, no stale references.
- [ ] Frontend and backend land in **separate commits**; one-line Conventional Commits, no body, no AI trailer.
