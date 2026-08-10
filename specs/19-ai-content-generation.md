# Spec: AI Content Generation

> Priority: P2 · Area: core · ai · client · cross · Status: drafted

## Overview

Ship the "AI-native" promise: let users generate and refine CMS field content with
an LLM, directly from the content editor. AI generation runs **in-process inside
core-service** (a new `AiModule` behind an `AiProvider` interface) — not as the
standalone `apps/ai-service`. This avoids the extra container/deploy cost now; the
FastAPI `ai-service` stays a **deferred extraction target** (swap the provider impl
for an HTTP client, callers unchanged). MVP scope is **Tier 1 fields only** —
`text`, `richtext`, `select` — with single-shot + multi-turn refinement. Provider is
**OpenRouter** (OpenAI-compatible Chat Completions) via the official `openai` SDK,
default model `openrouter/free` (env-overridable). Each call is metered against the
existing `aiTextRequestsPerMonth` plan limit (specs/15) and recorded for audit. Maps
to the "AI generation" gap in `doc/market-readiness.md` (P2) and the `ai-service`
🔲 row in `doc/status.md`.

## Depends on

- [specs/14 — Usage Metering](./14-usage-metering.md) — metering pattern (`usage_buckets`,
  atomic increment, period math) and the `UsageView`/`aiText` stat slot. ✅ shipped.
- [specs/12 — RBAC Permissions](./12-rbac-permissions.md) — `Permission` catalog + edge
  enforcement to gate the generate route. ✅ shipped.
- [specs/15 — Plan Revamp](./15-plan-revamp-and-pricing.md) — defines `aiTextRequestsPerMonth`
  / `aiImageRequestsPerMonth` limit fields (currently unenforced). ✅ shipped.
- `apps/core-service/src/entitlements` — `CoreEntitlementsService` (fetch+cache plan limits,
  fail-open). ✅ shipped.

## Tooling context (skills / MCP / plugins)

- **No OpenRouter MCP plugin available.** Researched via web instead of memory:
  - `WebFetch` on [OpenRouter API Reference](https://openrouter.ai/docs/api-reference/overview) →
    confirmed: only `Authorization` + `Content-Type` strictly required; `HTTP-Referer` +
    `X-Title` recommended (attribution/rankings); `usage` object returns
    `prompt_tokens`/`completion_tokens`/`total_tokens`; OpenRouter-specific params
    `models[]` (fallback) + `route:'fallback'`; streaming usage in final chunk.
  - `WebSearch` "OpenAI Node SDK chat completions streaming usage 2026" → Chat Completions
    is the right API (OpenRouter does NOT implement OpenAI's newer Responses API);
    `stream_options:{include_usage:true}` yields usage on stream end (for phase-2 streaming).
  - `WebSearch` "NestJS OpenAI provider pattern timeout 2026" → confirmed injectable-provider
    pattern for swappability; **OpenAI SDK default HTTP timeout is 10 min** — must override
    explicitly to avoid hanging the TCP handler.
  - `WebSearch` OpenRouter free router → `openrouter/free` selects a random free model
    (inconsistent output) vs `openrouter/auto` (may include paid). MVP uses `openrouter/free`.
- Supabase MCP / Stripe skills — not relevant to this feature.

## Scope

- In scope:
  - `AiModule` + `AiProvider` interface in core-service (OpenRouter impl via `openai` SDK).
  - `core.ai.generate` TCP pattern + gateway HTTP route `POST /content/ai/generate`.
  - Tier 1 field generation: `text`, `richtext`, `select` only.
  - Operations: `generate`, `expand`, `shorten`, `rewrite`, `tone`, `summarize`, `continue`.
  - Multi-turn refinement (client sends `messages[]`; stateless backend).
  - `FieldDef.aiAssist?: boolean` opt-in flag (builder toggle).
  - `ai_generations` table (metering + audit + token totals) in `core_svc`.
  - Hard-enforce `aiTextRequestsPerMonth` plan limit per billing period.
  - Frontend: wire the existing editor AI chat panel + per-field quick-action buttons +
    preview→apply step; in-memory conversation history.
- Out of scope (explicitly deferred):
  - Image generation (`media` field) — different model/cost; phase 2.
  - `reference` field generation (needs content-graph RAG) — phase 2+.
  - `number` / `boolean` / `date` field generation — no reliable value.
  - Streaming to the browser (needs SSE/WebSocket at the gateway; TCP can't stream) — phase 2.
  - Token-based (vs request-count) plan limits — schema stores tokens now, enforcement switches later.
  - Extraction to the standalone FastAPI `ai-service` — deferred (the interface makes this a later one-day swap).
  - Persisting conversation history to the DB — client-held in memory; entry revisions cover audit.

## API / endpoints

- `POST /api/v1/content/ai/generate` — run one AI generation/refinement turn for a Tier 1
  field of a content type (optionally against an existing entry). Returns generated text +
  token usage. Does **not** mutate the entry — the client applies the text via the normal
  entry update flow (so AI output is a preview until the user inserts it, and any applied
  result is captured by the existing revision history). — **access-token** (JWT) +
  `WorkspaceGuard` + `ProjectGuard` + `PermissionGuard` (existing content-write permission).

Request body (DTO `AiGenerateDto`):

```ts
{
  contentTypeId: string;      // which content type (for field-def lookup + context)
  entryId?: string;           // existing entry to pull other field values as context
  fieldKey: string;           // target field (must be text|richtext|select, aiAssist !== false)
  operation: 'generate'|'expand'|'shorten'|'rewrite'|'tone'|'summarize'|'continue';
  instruction?: string;       // freeform refinement note (e.g. "make it punchier", tone target)
  history?: AiTurn[];         // prior turns for multi-turn (client-held); see contract below
  tone?: string;              // optional tone hint
}
```

Response (`data`):

```ts
{
  text: string;               // generated/refined content (for select: one of options[])
  model: string;              // the model actually used — provider returns response.model (may differ from AI_MODEL for openrouter/free)
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  remaining: number | null;   // requests left in the billing period (null if unmetered)
}
```

For `select` fields: `text` is constrained to one of the field's `options[]`; provider output
is validated and retried once if it misses (free models can't be trusted with structured output).
If the retry still misses → `AI_GENERATION_FAILED` (502), the row is marked `failed`, and **no quota
is charged**.

Error responses: `PLAN_LIMIT_REACHED` (403, over monthly quota — atomic, before the provider call),
`RATE_LIMITED` (429, per-workspace burst throttle), `AI_NOT_CONFIGURED` (503, `AI_API_KEY`
missing), `AI_GENERATION_FAILED` (502, provider error / timeout / upstream 429 / `select` retry-miss),
`VALIDATION_ERROR` (422, non-Tier-1 field or `aiAssist:false`).

## Shared contracts (@wriven/contracts)

New/changed in `libs/shared/contracts/src/lib`:

- **`types/cms.types.ts`** — add to `FieldDef`:
  ```ts
  /** Allow AI generation on this field (Tier 1: text|richtext|select). Default true for those types. */
  aiAssist?: boolean;
  ```
- **`messages.ts`** — new pattern group:
  ```ts
  /** AI content generation. Owned by core-service (in-process AiModule). See specs/19. */
  export const AI_PATTERNS = {
    GENERATE: 'core.ai.generate',
  } as const;
  ```
- **`dto/ai.dto.ts`** (new) — `AiGenerateDto` (class-validator), `AiTurn` type
  (`{ role: 'user'|'assistant'; content: string }`), `AiOperation` union, `AiGenerateResult` view.
- **`errors.ts`** — add:
  ```ts
  // The LLM provider call failed (upstream error, timeout, bad response, upstream rate limit).
  AI_GENERATION_FAILED: { code: 'AI_GENERATION_FAILED', statusCode: 502 },
  // AI provider is not configured (AI_API_KEY missing). Returned, not a boot failure.
  AI_NOT_CONFIGURED: { code: 'AI_NOT_CONFIGURED', statusCode: 503 },
  ```
  Quota exhaustion reuses `PLAN_LIMIT_REACHED` (403); the per-workspace burst throttle reuses
  `RATE_LIMITED` (429); `select` retry-miss reuses `AI_GENERATION_FAILED` (502).

## Database / schema

New table `ai_generations` in **`core_svc`** (one row per generation — serves metering via
row-count, plus audit and token totals):

| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| workspace_id | uuid | indexed |
| project_id | uuid | indexed (denormalized scope) |
| content_type_id | uuid | nullable (→ content_types, no FK cross-boundary) |
| entry_id | uuid | nullable; the entry the gen was for (if any) |
| field_key | text | which field |
| operation | text | the `AiOperation` |
| model | text | model string used |
| prompt_tokens | integer | |
| completion_tokens | integer | |
| total_tokens | integer | |
| status | text | `pending` \| `succeeded` \| `failed` CHECK (reservation → finalized; quota counts `pending`+`succeeded`) |
| error | text | nullable; short failure reason (never raw provider payload) |
| created_by | uuid | from gateway-injected userId |
| created_at | timestamptz | default now() |

Indexes: `(workspace_id, created_at)` (period metering query), `(entry_id)` (per-entry audit).

Metering query (period = calendar month, UTC — matches `usage_buckets`) — counts reserved + done:

```sql
SELECT count(*) FROM ai_generations
WHERE workspace_id = $1 AND status IN ('pending','succeeded')
  AND created_at >= date_trunc('month', now());
```

Compare to `aiTextRequestsPerMonth` from `CoreEntitlementsService`. **Hard-enforce + atomic** (each
call costs real tokens): take `pg_advisory_xact_lock(hashtext(workspace_id))`, insert the `pending`
row, run the count, throw `PLAN_LIMIT_REACHED` (403) — deleting the pending row — *before* calling the
provider; finalize the row to `succeeded`/`failed` after. The advisory lock closes the concurrent-count
race that plain count-then-compare leaves open.

`/usage` dashboard wiring: `UsageView.aiText.used` = in-period count of `ai_generations` with
`status='succeeded'` (succeeded only for the stat; quota reserves against pending+succeeded). Single
source of truth — do **not** also write `usage_buckets`.

Migration: `pnpm db:core:generate` then `pnpm db:core:migrate` (Drizzle, `core_svc`).

## Backend changes

### core-service
- **Create** `apps/core-service/src/ai/`:
  - `ai.module.ts` — registers `AiProvider` (OpenRouter impl) + controller + service.
  - `ai.controller.ts` — `@MessagePattern(AI_PATTERNS.GENERATE)` handler; validates field is
    Tier 1 + `aiAssist !== false`; enforces plan quota; calls provider; persists `ai_generations`
    row; returns `AiGenerateResult`.
  - `ai.service.ts` — orchestrates: build context payload (content type name/field labels + other
    entry field values), assemble `messages[]` (system prompt + history + instruction), map
    `operation` → prompt template, post-process (`select` validation/retry, trim).
  - `ai-provider.interface.ts` — `AiProvider { generate(input): Promise<{text; usage; model}> }`.
    The extraction seam — swapping impl for an HTTP client to `ai-service` later changes nothing else.
  - `providers/openai-compatible.provider.ts` — a **generic** OpenAI-compatible provider using the
    `openai` SDK (works with OpenRouter, OpenAI, Groq, Together, Ollama, …; swapped via env, not code).
    `new OpenAI({ apiKey: AI_API_KEY, baseURL: AI_BASE_URL, timeout: AI_TIMEOUT_MS, defaultHeaders: <parsed AI_HEADERS JSON> })`;
    calls `chat.completions.create({ model: AI_MODEL, messages, ... })`, reads `response.usage` + `response.model`.
  - `ai-prompt.ts` — system prompt + per-operation templates + tone injection.
- **Modify** `apps/core-service/src/app/app.module.ts` — import `AiModule`.
- **Modify** `apps/core-service/src/db/schema/index.ts` — add `aiGenerations` table.
- **Modify** `apps/core-service/src/entitlements/core-entitlements.service.ts` — add
  `aiTextLimit(workspaceId): Promise<number | null>` (mirrors `revisionsCap`) — returns the plan's
  `aiTextRequestsPerMonth` (cached, fail-open). The atomic reserve (advisory lock + pending row +
  count vs limit) lives in `AiService` so the auth round-trip never extends the lock hold.
- **Modify** `apps/core-service/.env` / `.env.example` — add `AI_API_KEY`, `AI_BASE_URL`
  (default `https://openrouter.ai/api/v1`), `AI_MODEL` (default `openrouter/free`), `AI_TIMEOUT_MS`
  (default 30000), `AI_HEADERS` (optional JSON of extra provider headers).

### api-gateway
- **Create** `apps/api-gateway/src/content/ai.controller.ts` — `POST /content/ai/generate`,
  `@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard, PermissionGuard)` with existing
  content-write `@RequirePermission(...)`. Forwards `{ workspaceId, projectId, userId, dto }` to
  `core.send(AI_PATTERNS.GENERATE, …)`. (No `AI_SERVICE_URL` on the gateway — AI is core-internal.)
- **Modify** the gateway's core TCP client registration is already present — no change.
- **Modify** `apps/api-gateway/src/app/app.module.ts` — register `AiController` in the
  `controllers: []` array (the gateway has **no per-feature modules**; all controllers register
  here, like `MediaController`). Do **not** create a `content.module.ts`.

### auth-service
- No changes. Plan limits (`aiTextRequestsPerMonth`) already seeded + resolved via
  `AUTH_PATTERNS.ENTITLEMENTS_RESOLVE`.

### ai-service (FastAPI)
- No changes. Stays a deferred skeleton.

## Frontend changes (apps/client)

- **Create** `src/features/content/ai/` — hooks + components:
  - `useAiGenerate` — TanStack Query `mutation` calling `POST /content/ai/generate`
    (`aiApi.generate`). Holds in-memory `messages[]` history (Zustand or local state); caps last
    ~8 turns before sending.
  - `<AiPanel />` — wires the existing editor AI chat panel UI to the backend: freeform instruction
    input + operation buttons (Generate / Expand / Shorten / Rewrite / Tone / Summarize / Continue).
  - `<AiFieldAction />` — the ✨ quick-action control rendered on `text` / `richtext` / `select`
    fields where `aiAssist !== false` (reads the field def).
  - Preview → Apply: AI output shows in the panel as a preview; "Insert" / "Replace" writes it into
    the field's local form state. Nothing is saved until the user saves the entry (→ existing
    revision history captures it).
- **Modify** `src/lib/api.ts` (or `contentApi`) — add `aiApi.generate(dto)`.
- **Modify** the content type **builder** — add an "Allow AI assist" toggle per field (writes
  `aiAssist`); default on for `text`/`richtext`/`select`, off otherwise.
- **Modify** the content **editor** — mount `<AiPanel />` + `<AiFieldAction />`.

## Files to create

- `libs/shared/contracts/src/lib/dto/ai.dto.ts`
- `apps/core-service/src/ai/ai.module.ts`
- `apps/core-service/src/ai/ai.controller.ts`
- `apps/core-service/src/ai/ai.service.ts`
- `apps/core-service/src/ai/ai-provider.interface.ts`
- `apps/core-service/src/ai/providers/openai-compatible.provider.ts`
- `apps/core-service/src/ai/ai-prompt.ts`
- `apps/api-gateway/src/content/ai.controller.ts`
- `apps/client/src/features/content/ai/useAiGenerate.ts`
- `apps/client/src/features/content/ai/AiPanel.tsx`
- `apps/client/src/features/content/ai/AiFieldAction.tsx`
- `specs/19-ai-content-generation.md` (this file)

## Files to modify

- `libs/shared/contracts/src/lib/types/cms.types.ts` (`FieldDef.aiAssist`)
- `libs/shared/contracts/src/lib/messages.ts` (`AI_PATTERNS`)
- `libs/shared/contracts/src/lib/errors.ts` (`AI_GENERATION_FAILED`)
- `libs/shared/contracts/src/index.ts` (barrel exports)
- `apps/core-service/src/db/schema/index.ts` (`aiGenerations`)
- `apps/core-service/src/app/app.module.ts` (import `AiModule`)
- `apps/core-service/src/entitlements/core-entitlements.service.ts` (AI limit accessor)
- `apps/core-service/.env` + `.env.example`
- `apps/api-gateway/src/app/app.module.ts` (register `AiController` in `controllers: []`)
- `apps/client/src/lib/api.ts` (`aiApi`)
- Content type builder + editor (AI toggle + panel mount)

## New dependencies

- `openai` (npm) — added to `apps/core-service/package.json` (`workspace`/root install via
  `pnpm`). The OpenRouter-compatible Chat Completions client. No other new deps.

## Rules for implementation

Base:
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts`
  (`@wriven/contracts`) — check it before creating new ones.
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime.
- Respect microservice boundaries — AI logic lives in core-service; the gateway only forwards.
  Do **not** collapse the deferred `ai-service` boundary in code (the `AiProvider` seam preserves it).
- Endpoints return the response envelope; use error codes from
  `@wriven/contracts/errors.ts`; never leak stack traces, provider payloads, model errors, or DB errors.
- Use dot-namespaced patterns from `@wriven/contracts/messages.ts`, never hardcoded strings.
- Frontend (`apps/client`) and backend changes go in **separate commits**;
  stage selectively, never `git add -A` across both.
- Run tasks through `pnpm nx <target> <project>`. Commits are one-line
  Conventional Commits with no body.

Feature-specific:
- **Provider keys are core-service-only.** `AI_API_KEY` never appears in the gateway or
  client env, and is never sent to the browser.
- **Fail-closed if AI is unconfigured, but never boot-fail.** Missing `AI_API_KEY` → the
  `/content/ai/generate` route returns `AI_NOT_CONFIGURED` (503); core-service still boots and all
  non-AI features keep working.
- **Explicit SDK timeout.** Set `timeout` on the `openai` client (~30s). Never rely on the 10-min
  default — it hangs the TCP handler.
- **Provider headers are generic.** The provider is OpenAI-compatible (OpenRouter, OpenAI, Groq, …);
  any provider-specific headers (e.g. OpenRouter attribution) come from the optional `AI_HEADERS` JSON
  env — no provider name baked into code.
- **Atomic quota — it costs money.** Count-then-compare is non-atomic: concurrent calls can both
  pass and both hit the provider. Reserve atomically: `pg_advisory_xact_lock(hashtext(workspace_id))`
  → insert a `pending` `ai_generations` row → count `status IN ('pending','succeeded')` in-period →
  throw `PLAN_LIMIT_REACHED` (403) if over (delete the pending row) → else call the provider → finalize
  the row to `succeeded`/`failed`. Hard-enforce, unlike the soft delivery-requests gate.
- **Burst throttle (protects the shared key).** A per-workspace sliding window (~10 req/min) on the
  gateway route → `RATE_LIMITED` (429). The monthly quota stops long-term abuse; this stops one
  workspace exhausting the shared `AI_API_KEY`'s ~20 RPM and degrading AI for every user.
- **No structured-output reliance on free models.** `select` constraint = prompt + validate against
  `options[]` + one retry. **If the retry still misses → `AI_GENERATION_FAILED` (502), row marked
  `failed`, no quota charge** (don't bill for unconstrainable output). Do not use
  `response_format`/tool-use on `openrouter/free`.
- **Temperature per operation.** Default `0.7`; lower (`0.2`–`0.3`) for `rewrite` and `select`
  (deterministic). Chosen in the provider call from the operation.
- **Prompt-injection mitigation.** Sibling entry field values are user-controlled content interpolated
  into the prompt. Delimit them as **data** (clear fences) in the system prompt and instruct the model
  to treat entry context as untrusted data, not instructions.
- **AI output is never auto-saved.** The endpoint returns text; the client applies it via the
  normal entry update. Revisions audit any applied AI change for free.
- **Persist every generation** (pending → succeeded/failed) to `ai_generations` for metering + audit;
  never store raw prompts/responses longer than needed — store token counts + a short status/error.
- **Single source of truth for the `aiText` stat.** The `/usage` dashboard `aiText.used` is the
  in-period count of `ai_generations` (`status='succeeded'`) — no `usage_buckets` double-write.
- **Extraction-ready seam.** All LLM access goes through `AiProvider`. No direct SDK calls outside
  `providers/openai-compatible.provider.ts`. Future `ai-service` split = swap that one file for an HTTP client.
- **Chat Completions API.** Use Chat Completions (widest compatibility across the models behind
  OpenRouter), not OpenAI's Responses API.

## Definition of done

- [ ] `pnpm nx typecheck core-service api-gateway client` — clean.
- [ ] `pnpm nx lint core-service api-gateway client` — clean.
- [ ] `pnpm nx build core-service api-gateway client` — clean.
- [ ] `pnpm db:core:generate` + `pnpm db:core:migrate` — `ai_generations` table exists in `core_svc`.
- [ ] `AI_PATTERNS.GENERATE`, `AI_GENERATION_FAILED`, `FieldDef.aiAssist`, `AiGenerateDto` exported
      from `@wriven/contracts`.
- [ ] Manual smoke (core + gateway running with a real `AI_API_KEY`):
      `POST /api/v1/content/ai/generate` with `{ contentTypeId, fieldKey, operation:'generate' }`
      on a `richtext` field returns `{ text, model, usage, remaining }` in the success envelope.
- [ ] Multi-turn: a second call with `history` (first user+assistant) + `instruction:"shorten"`
      returns a shorter refinement of the first output.
- [ ] `select` field: returned `text` is a member of `options[]` (validated; retry path exercised).
- [ ] Quota: with `aiTextRequestsPerMonth` artificially low for the workspace, the (N+1)th call in
      the period returns `{ success:false, error:{ code:'PLAN_LIMIT_REACHED', statusCode:403 } }`
      and **no** provider call is made. Quota check is atomic (pending row + `pg_advisory_xact_lock`).
- [ ] Burst throttle: > ~10 calls/min from one workspace → `RATE_LIMITED` (429).
- [ ] Unconfigured: with `AI_API_KEY` unset, the route returns `AI_NOT_CONFIGURED` (503) and
      core-service still boots.
- [ ] `select` retry-miss: returns `AI_GENERATION_FAILED` (502), a `failed` row, and **no** quota charge.
- [ ] `/usage` dashboard: `aiText.used` reflects the in-period succeeded `ai_generations` count.
- [ ] Provider failure path: with a bad `AI_MODEL`, the endpoint returns
      `{ code:'AI_GENERATION_FAILED', statusCode:502 }` — no provider payload leaks — and a failed
      `ai_generations` row is recorded.
- [ ] `aiAssist:false` field → generate rejected with `VALIDATION_ERROR`; a `number`/`date`/
      `boolean`/`media`/`reference` field key → rejected with `VALIDATION_ERROR`.
- [ ] Editor: ✨ button appears only on Tier 1 fields with `aiAssist !== false`; AI output is
      preview-then-Insert; saving the entry writes a new revision (History drawer shows it).
- [ ] `doc/status.md` + `doc/core-service/core-service.md` updated to mark AI generation ✅ (Tier 1)
      when this lands.
