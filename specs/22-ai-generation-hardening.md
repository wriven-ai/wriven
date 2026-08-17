# Spec: AI Generation Hardening — Review Fixes and UX Completion

> Priority: P1 · Area: cross · Status: drafted
> Extends [specs/21](./21-ai-generation-redesign.md) (shipped). Full-stack review of the AI
> generation feature found 1 P0, 4 P1, ~15 P2, ~15 P3 defects — clustered at cross-service
> seams (error wire, retry semantics, richtext schema drift), not in the metering core.
> Pre-ship product with no users: **breaking contract changes are allowed** and used where
> they make semantics honest. The spec 21 model (typed `AiOutput`, `compose`,
> Generate/Refine + presets, cost accounting) is kept — this spec fixes and completes it.

## Overview

A line-by-line review of specs/21's implementation (ai-service, core-service, gateway,
contracts, client) verified the metering invariants are sound but found a P0 that crashes
the failed-row finalize path (snake_case usage on the error wire → NaN cost on an integer
column → 500 + rows stuck `pending`), dead prompt-snapshot coverage, a UI retry affordance
that can never succeed by design, richtext fields with images being silently read as empty
(and their content destroyed on Append), and a set of validation/hardening gaps at the
gateway and profile surfaces. This spec fixes every finding (P0 → P3), records the
decisions taken (token caps, retry semantics, error-code persistence), and completes the
author UX: compose discoverability, full preview + undo, per-field targeting, honest retry.
Execution is ordered in waves so correctness lands and is verifiable before refactor.

## Decisions (recorded up front)

| # | Decision | Choice |
|---|---|---|
| D1 | Output-token caps | **Keep generous caps as shipped**: `compose` 6 000, `refine` 3 000 (spec 21 said 2 400/1 200 — superseded). Provider is `openrouter/free` ($0), so spend is irrelevant while truncation is a direct UX hit. Recorded as a spec-21 refinement correction. |
| D2 | Retry semantics | After a **terminal** failure the UI's affordance is "Try again" with a **new** `requestId`. Same-key (idempotent) retry is offered **only** in the stop-waiting / `AI_GENERATION_IN_PROGRESS` (409) path, where replay is safe. The server enforces this: replaying a failed key rethrows the **stored error code**; replaying a succeeded-but-redacted key returns the new `AI_RESULT_EXPIRED`. |
| D3 | Failed-row error fidelity | `ai_generations` gains `error_code` — the contract code (`AI_INPUT_TOO_LARGE`, …) is persisted alongside `error` text so a retried failed key returns the correct status class (422 stays 422), and analytics can split failure causes. |
| D4 | Redacted-succeeded replay | New error code `AI_RESULT_EXPIRED` (410): the idempotency key's stored result was redacted by retention; the client must start a new generation. Distinct from failure — never report success-shaped states as errors. |
| D5 | Profile workspace stamp | The gateway resolves the **authoritative** `workspaceId` from the project record during `ProjectGuard` and injects it into `PROFILE_UPDATE` payloads; core never persists the raw `X-Workspace-Id` header for the profile upsert. (The generate path already double-scopes and is unaffected.) |
| D6 | Glossary `null` | `PATCH` treats `glossary: null` as "clear" → `[]`, in **both** insert and conflict paths (NOT NULL column; today `null` 500s). |
| D7 | Input budget | The 24 000-char `sourceContent` cap must be **reachable**: the aggregate budget applies to user content with a fixed wrapper allowance (~512 chars) for operation/type/profile framing, so an exactly-24 000-char input passes. |
| D8 | Profile cache | No cache. Spec 21's "cached briefly per project" is dropped — one indexed single-row read per generation is nothing; the `resolve()` alias is removed. Recorded as a spec-21 refinement correction. |

## Post-build adjustments (product decisions after the waves landed)

Recorded so the DoD below reads correctly against what shipped:

- **Preset chips are Refine-only.** The DoD item "preset chips visible from
  Generate" shipped, then was reversed on review: refine verbs under a Generate
  intent read as generate options and mix modes. Chips now render only while
  Refine is active (and the Refine segment itself is hidden on an empty field).
- **Field-flow instruction is always required** (Generate included) — an
  instruction-less generation has no topic anchor and burns a quota unit on
  generic filler. Compose keeps its brief **optional**: the field schema
  (keys/labels/types/options) grounds the draft.
- **Prompt is now `text-v4`** — a topical anchor was added to both prompts
  (answer anything as publishable content, never chat; guardrail leak markers
  extended; migration 0014 fixed the column default).
- Compose preview gained a one-click Expand-all/Collapse-all; the AI Voice
  surface was renamed "AI Settings"; the entry editor auto-collapses the nav
  sidebar (restored on leave); step-level `request_id` tracing was added across
  gateway → core → ai-service logs.

## Depends on

- [specs/21 — AI Generation Redesign](./21-ai-generation-redesign.md) — ✅ shipped. This spec hardens it.
- [specs/12 — RBAC](./12-rbac-permissions.md) — permission catalog reused unchanged.

## Tooling context (skills / MCP / plugins)

No domain tools used — internal fixes against existing surfaces (FastAPI, NestJS, Drizzle,
TipTap, TanStack Query). All findings verified against code directly during review
(2026-08-16); pytest suite (40 tests) and `pnpm nx typecheck core-service api-gateway
client` pass on `main` before these changes.

## Scope

- In scope — every finding from the 2026-08-16 review, in four waves:
  - **Wave 1 — Correctness (P0/P1)**: error-wire usage serialization; success-body
    validation; shared richtext extension set (image false-empty + Append deletion);
    honest retry affordances; restore shadowed snapshot test; add the missing FastAPI
    route test.
  - **Wave 2 — Hardening (P2)**: error registry additions; `@IsUUID` on ids; failed-row
    `error_code` persistence; `AI_RESULT_EXPIRED`; glossary-null normalization; profile
    workspace stamp; env-number guards; repair-path usage aggregation; compose `entryId`
    existence check; entry-branch cross-field rejection; UI P2 bugs (stale result across
    target switch, dual-mount state split, unscoped profile query key, concurrent
    flows self-429).
  - **Wave 3 — UX + refactor (P2/P3)**: compose hero + full preview + undo; per-field
    sparkle targeting; preset chips visible from Generate; panel split into units <200
    lines; single AiPanel instance; unmount abort; profile client caps; remaining UX P3s.
  - **Wave 4 — Docs**: spec 21 refinement log corrected; ai-governance updated (guardrail
    repair is a third second-call type; error-code persistence); api-reference new codes.
- Out of scope:
  - Streaming to the browser, embeddings/RAG, async job queue, media/image generation,
    translation, token-based plan limits, model routing — unchanged from spec 21's deferrals.
  - Any change to the metering invariants (quota reserve, idempotency, failed-rows-don't-bill,
    compose = 1 unit, cost honesty). These are verified sound and locked.
  - Admin-panel AI cost console (separate spec per spec 21).
  - Redis-backed burst throttle (stays in-memory, documented).

## API / endpoints

No new endpoints. Changed behavior on existing ones:

- `POST /api/v1/content/ai/generate` (access-token + workspace/project/permission guards)
  - Non-UUID `contentTypeId`/`entryId` → `VALIDATION_ERROR` 422 (was: 500 via Postgres 22P02).
  - `targetKind:'entry'` with `preset` or `fieldKey` present → `VALIDATION_ERROR` 422
    (was: silently ignored).
  - `targetKind:'entry'` with unknown/unscoped `entryId` → `NOT_FOUND` 404 (was: stored raw).
  - Retrying a failed `requestId` → the **original** error code + message (422 stays 422;
    was: always 502 `AI_GENERATION_FAILED`).
  - Retrying a succeeded-but-redacted `requestId` → `AI_RESULT_EXPIRED` 410 (was:
    misleading 502 "previous generation failed").
  - A malformed 200 body from ai-service → `AI_GENERATION_FAILED` 502, row finalized
    `failed` (was: raw TypeError → 500, row stuck `pending`).
- `PATCH /api/v1/content/ai/profile` (project-admin via `CONTENT_TYPE_MANAGE`)
  - `glossary: null` → cleared (`[]`), 200 (was: 500).
  - `workspaceId` in the TCP payload is gateway-resolved from the project record, not the
    client header.
- ai-service `POST /generate` (internal)
  - Error bodies carry camelCase `usage` (fixes spent-token metering + NaN cost).
  - `ProviderError` carries spent usage from any completed attempt, including a repair
    attempt that itself failed.

## Shared contracts (@wriven/contracts)

- **`errors.ts`** — add:
  - `AI_RESULT_EXPIRED: { statusCode: 410 }` — idempotency key's stored result was redacted
    by retention; start a new generation.
  - `GATEWAY_TIMEOUT: { statusCode: 504 }` — moves the gateway's invented literal into the
    registry (hard rule: codes live here).
- **`dto/ai.dto.ts`** — `AiGenerateDto.contentTypeId` / `entryId`: `@IsString()` → `@IsUUID()`
  (422 before Postgres ever sees them).

## Database / schema

Migration `0013` (`core_svc`, Drizzle; `pnpm db:core:generate` → `pnpm db:core:migrate`):

| change | reason |
|---|---|
| `ai_generations.error_code text` (nullable) | persist the contract code on failed rows (D3) |
| `ai_generations.prompt_version` default `'text-v2'` → `'text-v3'` | rows that never finalize currently mis-attribute the prompt generation |

No other schema changes. `ai_profiles` is unchanged (glossary normalization is code-only).

## Backend changes

### ai-service (Python / FastAPI)

- **`app/schemas.py`** — `Usage` becomes a `CamelModel` (or is replaced by `UsageOut`), so
  the error handler's `model_dump(by_alias=True)` emits `promptTokens`/`completionTokens`/
  `totalTokens`. **P0.** Also: `GenerateRequest` validator rejects non-`compose` operations
  with `target_kind != 'field'`.
- **`app/llm.py`** — `ProviderError` carries `usage`/`model` from the completed attempt;
  log provider failures as status + exception type only (never the provider body, per
  governance). Caps stay 6 000/3 000 (D1) — add a comment citing this spec.
- **`app/generator.py`** — aggregate spent usage across **all** attempts, including a
  repair attempt that raises (today attempt-1 tokens are discarded). `_parse_record`
  coerces JSON scalars honestly: bools → `"true"`/`"false"`, numbers → their JSON literal;
  objects/arrays dropped (today Python `str()` yields `"True"`).
- **`app/config.py` / `app/schemas.py`** — input budget: apply `ai_max_input_chars` to user
  content with a fixed wrapper allowance so exactly-24 000 passes (D7).
- **`app/security.py`** — non-ASCII `X-Internal-Secret` → 401 (encode or catch `TypeError`);
  today it becomes a generic 502.
- **`app/observability.py`** — unhandled-exception path increments the HTTP counters too;
  fix the mislabeled HELP text.
- **`tests/`** — restore the shadowed `test_richtext_prompt_carries_every_required_rule`
  (delete the empty duplicate at line 137 — the 6-assertion original at line 62 is currently
  dead). **Create `tests/test_generate_route.py`**: FastAPI `TestClient` + fake LLM client —
  401 secret, 422 `AI_INPUT_TOO_LARGE`, Pydantic-422 collapse, 502 passthrough, **the error
  body's camelCase `usage` wire shape** (the P0's missing guard), response aliasing, and the
  output discriminator union.

### core-service (NestJS TCP :5002)

- **`src/ai/ai-service.client.ts`** — validate the 200 body before returning: `output`
  (union with `kind`), `model` (string), `usage` (finite numbers). Malformed →
  `AiClientError('AI_GENERATION_FAILED')` so the row finalizes `failed` instead of crashing
  raw with the row stuck `pending`. **P1.**
- **`src/ai/ai.service.ts`**
  - `finalize` failed path persists `errorCode` (D3) — replay of a failed key rethrows it.
  - Succeeded-but-redacted replay branch (`output == null` after retention) →
    `AI_RESULT_EXPIRED` 410 (D4). The request-hash guard stays skipped for redacted rows.
  - Entry branch: reject `preset`/`fieldKey` when `targetKind === 'entry'`; verify
    `entryId` existence + workspace/project scope before insert (`NOT_FOUND`).
  - `AI_AUDIT_RETENTION_DAYS` parse: empty/NaN → 30 (today blank env → 1 day).
  - `redactExpiredAuditData`: count without `.returning()` id materialization.
  - Drop the `promptVersion` constant/comment drift; column default fixed in 0013.
- **`src/ai/ai-profile.service.ts`** — glossary `null` → `[]` in both insert and
  `onConflictDoUpdate` paths (D6); remove the uncached `resolve()` alias (D8) and fix the
  comment claiming the gateway verified the workspace binding.
- **`src/content/content-types.service.ts`** — `assertFieldPolicies`: `aiContextFields`
  keys must be scalar (non-`multiple`) fields — array values are otherwise silently dropped
  from sibling context. Rename the stale `AI_ASSIST_FIELD_TYPES` constant.
- **`src/content/entries.service.ts`** — `linkAiGenerationsToRevision`: compute
  `appliedFieldKeys` before the update and write once per row (removes the second
  UPDATE-per-compose-row inside the save transaction).
- **`src/usage/usage.service.ts`** — fix the stale `used: null` comment.

### api-gateway

- **`src/content/ai.controller.ts`** — use `ERROR_CODES.GATEWAY_TIMEOUT` (registry code);
  guard both timeout env parses: `Number.isFinite(x) && x > 0 ? x : default` (today an empty
  `AI_GATEWAY_TIMEOUT_MS` → `timeout(0)` → 100% instant 502s).
- **`src/auth/project.guard.ts`** (or its auth-service dependency) — resolve the project's
  owning `workspaceId` and expose it on the request; the profile routes inject it into the
  `PROFILE_UPDATE` TCP payload (D5).
- **`src/common/all-exceptions.filter.ts`** — the 429 branch forwards the thrown message
  (the burst guard's workspace-specific text is currently dead code).

## Frontend changes (apps/client)

- **`src/components/editor/extensions.ts`** (new) — single exported TipTap extension array
  (StarterKit + Link + MediaImage) used by the editor, the AI panel's
  `generateHTML`/`generateJSON`, and previews. Fixes: richtext-with-image read as empty
  (Refine wrongly disabled) and **Append/Prepend destroying existing image content**.
  Deletes the 4 duplicated arrays in `ai-panel.tsx`. **P1.**
- **`src/components/content/ai-panel.tsx`** (split into `ComposeSection`, `FieldFlow`,
  `RichTextPreview`, `InlineDiff`, `PanelShell` + `richtext.ts` helpers — each unit <200
  lines; behavior-preserving except the fixes below):
  - Retry: terminal failure → primary "Try again" button issues a **new** `requestId`;
    same-key retry link appears **only** after stop-waiting/409 (D2). Removes the
    can-never-succeed "Retry the same request safely" loop.
  - Disable the target-field selector while a request is in flight; filter the preview by
    the result's own `targetKey` (no stale result under a switched field).
  - Single busy state across compose + field flows (no concurrent generations → no self-429).
  - Abort in-flight mutation on unmount.
  - Compose: full (expandable) per-field preview — no 140-char blind apply; undo snapshot
    of the overwritten form-data slice, same pattern as the field flow; error state gets a
    retry affordance; truncated notice gains the same remediation copy as the field path.
  - Compose placement: on an empty/new entry the Draft section is the panel's hero (open,
    first); on an entry with content it stays a collapsed secondary affordance.
  - Preset chips render in Generate too — clicking one switches to Refine + sets the preset
    (one fewer click on the common path).
  - Freeform refine (`intent:'refine'`, no preset) requires a non-empty instruction.
  - Alternates: applying one appends the matching assistant turn to `histories`.
  - Undo disabled once the author manually edits the applied field (dirty tracking).
  - `errMsg` map becomes a module constant; compose-aware message.
  - `Result`/`resultRef`/sync-effect collapsed into one state container (reducer or
    functional `setResult`).
- **`src/components/content/content-editor.tsx`** — one `AiPanel` instance in a responsive
  container (desktop sidebar + mobile sheet currently mount two independent stateful
  panels); per-field sparkle affordance on Tier-1 `FieldRow`s that sets `targetKey` and
  focuses the panel (dropdown remains as fallback); revision restore signals the panel to
  clear previews/history.
- **`src/components/content/ai-profile-panel.tsx`** — query key `['ai-profile', projectId]`
  with invalidation on scope change (today project A's voice shows under project B);
  client-side `maxLength` caps matching the server (brandVoice 2 000, term/prefer 80).

## Files to create

- `specs/22-ai-generation-hardening.md` (this file)
- `apps/ai-service/tests/test_generate_route.py`
- `apps/client/src/components/editor/extensions.ts`
- `apps/core-service/src/db/migrations/0013_*.sql` (generated)

## Files to modify

- `libs/shared/contracts/src/lib/errors.ts`, `dto/ai.dto.ts`
- `apps/ai-service/app/schemas.py`, `llm.py`, `generator.py`, `config.py`, `security.py`,
  `observability.py`; `tests/test_prompts_snapshot.py`
- `apps/core-service/src/ai/ai-service.client.ts`, `ai.service.ts`, `ai-profile.service.ts`;
  `src/content/content-types.service.ts`, `entries.service.ts`;
  `src/usage/usage.service.ts`; `src/db/schema/index.ts`
- `apps/api-gateway/src/content/ai.controller.ts`, `src/auth/project.guard.ts`,
  `src/common/all-exceptions.filter.ts`
- `apps/client/src/components/content/ai-panel.tsx` (split), `content-editor.tsx`,
  `ai-profile-panel.tsx`, `src/components/editor/rich-text-editor.tsx`
- Docs: `doc/ai-governance.md`, `doc/api-reference.md`, `doc/status.md`,
  `specs/21-ai-generation-redesign.md` (refinement log corrections: caps D1, promptVersion
  v3, profile cache D8)

## New dependencies

None.

## Rules for implementation

Base:
- Shared DTOs/types/patterns/errors live in `libs/shared/contracts` (`@wriven/contracts`) —
  never duplicated in a service. The core→ai-service payload stays a local interface
  mirrored as Pydantic.
- Respect microservice boundaries: ai-service owns no tables; quota, audit, profile, cost
  stay in core; core→ai is the only NestJS↔non-NestJS HTTP hop.
- Response envelope `{success,data}` / `{success,error}`; error codes from
  `@wriven/contracts/errors.ts`; never leak stack traces, provider payloads, or DB errors.
- Dot-namespaced patterns from `@wriven/contracts/messages.ts`.
- Frontend and backend changes go in **separate commits**; stage selectively. One-line
  Conventional Commits, no body, no AI co-author trailer.
- Run tasks through `pnpm nx <target> <project>`; ai-service tests via `uv run pytest`.

Feature-specific:
- **Preserve every metering invariant byte-for-behavior** (advisory-lock reserve,
  pending→terminal, stale reclaim, hash-guarded replay, failed-rows-don't-bill,
  compose = 1 unit, `0 ≠ null` cost honesty, retention keeps financial data). If a fix
  appears to require touching one, stop and re-read spec 21's rules first.
- **Every cross-language wire field gets a shape test.** The P0 shipped because the error
  body's `usage` had no test; the new route test locks the whole error envelope.
- **Fix waves land in order** (1 correctness → 2 hardening → 3 UX/refactor → 4 docs), each
  wave green (tests + typecheck + lint) before the next. The panel split is behavior-
  preserving and lands **after** the bugs it touches are fixed, so fixes stay reviewable.
- **Generous output budgets are deliberate** (D1): on a free model, truncation is worse
  than spend. Do not "tighten" caps back to spec 21's numbers.
- **AI output is never auto-saved**; compose apply stays per-field through form state —
  the new undo/preview changes presentation only.
- **One shared TipTap extension set** — nothing may construct its own `[StarterKit, …]`
  array; import from `editor/extensions.ts` so serialization can never drift from the
  editor schema again.

## Definition of done

**Wave 1 — correctness**
- [ ] ai-service error bodies serialize `usage` camelCase; `test_generate_route.py` locks
      the wire shape (401/422/502 + usage + aliasing + output union) and passes.
- [ ] `test_prompts_snapshot.py` has exactly one `test_richtext_prompt_carries_every_required_rule`
      and it runs (6 assertions).
- [ ] Malformed 200 from ai-service → 502 `AI_GENERATION_FAILED`, row finalized `failed`
      (unit test on the client seam).
- [ ] Richtext field containing an image: Refine enabled with real content; Append keeps
      the image; grep shows no second `StarterKit` array construction in the panel.
- [ ] After a terminal generation failure, the panel's affordance issues a new
      `requestId` and can succeed; after stop-waiting, the same-key retry link is visible.
- [ ] `uv run pytest` green; `pnpm nx typecheck test core-service api-gateway client` green.

**Wave 2 — hardening**
- [ ] `errors.ts` contains `AI_RESULT_EXPIRED` (410) and `GATEWAY_TIMEOUT` (504); no
      error-code string literals outside the registry in gateway AI routes.
- [ ] Non-UUID `contentTypeId`/`entryId` → 422; entry+`preset`/`fieldKey` → 422; unknown
      `entryId` on compose → 404.
- [ ] Migration 0013 applied: `error_code` column present; retrying a failed key returns
      the original status class (422 input-too-large stays 422 on retry); redacted-
      succeeded replay → 410 `AI_RESULT_EXPIRED`.
- [ ] `PATCH` profile with `glossary: null` → 200, glossary `[]`; profile rows carry the
      gateway-resolved workspace id (test with mismatched header).
- [ ] Empty/NaN `AI_GATEWAY_TIMEOUT_MS` env → default 40 000 (unit test); same for the
      profile timeout and core's retention-days parse (blank → 30).
- [ ] Provider failure during a repair attempt still records aggregated attempt-1 tokens
      on the failed row (pytest).
- [ ] Panel: target selector disabled while busy; result never renders under a switched
      field; one panel instance across desktop/mobile; profile editor shows the current
      project's profile immediately after project switch.

**Wave 3 — UX + refactor**
- [ ] Empty entry: Draft section is the panel hero and open; filled entry: collapsed.
- [ ] Compose preview expands to full text per field; apply has undo; undo disabled after
      manual edits; compose error and truncated states have retry/remediation affordances.
- [ ] Sparkle affordance on each Tier-1 field row targets the panel; preset chips visible
      in Generate and switch to Refine on click; freeform refine requires an instruction.
- [ ] `ai-panel.tsx` units each <200 lines; `pnpm nx build lint typecheck client` green.

**Wave 4 — docs**
- [ ] Spec 21 refinement log corrected (D1 caps, `text-v3`, D8 no cache); ai-governance
      documents the guardrail repair as a third second-call type and the `error_code`
      column; api-reference lists the new codes; `doc/status.md` notes the hardening.
