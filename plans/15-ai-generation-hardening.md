# Plan: AI Generation Hardening

> Status: drafted · Executes: spec 22 (`specs/22-ai-generation-hardening.md`) · Supersedes: -

## Goal

Fix all findings from the 2026-08-16 AI-generation review (1 P0, 4 P1, P2/P3) in four
dependency-ordered waves, ending with the author-UX completions and doc sync — metering
invariants untouched.

## Current state

Specs/19+20+21 shipped: typed `AiOutput` (`scalar`|`record`), `compose`, Generate/Refine
(+presets) author model, per-project AI voice, token/cost accounting, quota/idempotency/
retention machinery. Review verified the metering core sound; defects sit at seams. Today:
40/40 pytest green, typecheck green, `main` clean. Known shipped defects this plan fixes:
snake_case `usage` on the ai-service error wire (NaN cost → 500 + stuck `pending` rows),
no success-body validation in `AiClient`, shadowed prompt-snapshot test, missing route
test, dead "retry same request" affordance, richtext-image false-empty + Append deletion,
and the P2/P3 set catalogued in spec 22.

## Phases

### Phase 1 — Contracts + schema foundation

- **Why here** — core/gateway/auth changes depend on the new error codes, DTO validators,
  membership field, and the `error_code` column. Lands first so later phases compile.
- **Files — modify:**
  - `libs/shared/contracts/src/lib/errors.ts` — add `AI_RESULT_EXPIRED` (410),
    `GATEWAY_TIMEOUT` (504).
  - `libs/shared/contracts/src/lib/dto/ai.dto.ts` — `contentTypeId`/`entryId`:
    `@IsString()` → `@IsUUID()`.
  - `libs/shared/contracts/src/lib/types/auth.types.ts` — `ProjectMembership` gains
    `workspaceId: string` (authoritative binding for D5).
  - `apps/core-service/src/db/schema/index.ts` — `aiGenerations.errorCode` (text,
    nullable); `promptVersion` default → `'text-v3'`.
- **Verify:** `pnpm nx typecheck @wriven/contracts` (expect auth/core knock-on errors —
  fixed in Phases 3–4; this phase only generates the migration):
  `pnpm db:core:generate` → `pnpm db:core:migrate` → `\d core_svc.ai_generations` shows
  `error_code`, default `text-v3`.

### Phase 2 — ai-service correctness + test debt

- **Why here** — P0 lives here; no dependency on Phase 1 (error-wire fix is internal).
  Python-only, lands independently.
- **Files — modify:**
  - `app/schemas.py` — `Usage` → `CamelModel` (**P0**); non-`compose` ops must have
    `target_kind == 'field'` in the model validator.
  - `app/llm.py` — `ProviderError` carries `usage`/`model` from the completed attempt;
    provider-failure logging reduced to status + exception type (no body); cap comment
    citing spec 22 D1 (6 000/3 000 deliberate).
  - `app/generator.py` — aggregate spent usage when a **repair** attempt raises;
    `_parse_record` honest scalar coercion (bool → `"true"`/`"false"`, numbers → JSON
    literal, drop objects/arrays).
  - `app/config.py` + `app/schemas.py` — input budget: wrapper allowance (~512 chars)
    so exactly-24 000-char `sourceContent` passes (D7).
  - `app/security.py` — non-ASCII secret header → 401, not 502.
  - `app/observability.py` — unhandled path increments HTTP counters; HELP text fix.
  - `tests/test_prompts_snapshot.py` — delete the empty duplicate test at line 137
    (restores the 6-assertion original).
- **Files — create:**
  - `tests/test_generate_route.py` — TestClient + fake LLM: 401, 422
    `AI_INPUT_TOO_LARGE`, Pydantic-422 collapse, 502 passthrough, **camelCase `usage` on
    error bodies**, response aliasing, output union shapes.
- **Shared contracts:** none.
- **Verify:** `cd apps/ai-service && uv run pytest` — all green incl. new route tests;
  the `usage` wire-shape test fails against the pre-fix code (write it first, watch red).

### Phase 3 — core-service seam hardening

- **Why here** — depends on Phase 1 codes + column and Phase 2's honest error wire.
- **Files — modify:**
  - `src/ai/ai-service.client.ts` — validate the 200 body (`output` union, `model`
    string, finite `usage` numbers); malformed → `AiClientError('AI_GENERATION_FAILED')`
    so the row finalizes `failed` (**P1**).
  - `src/ai/ai.service.ts` —
    - failed `finalize` persists `errorCode`; replay of a failed key rethrows the stored
      code (D3);
    - succeeded-but-redacted replay → `AI_RESULT_EXPIRED` 410 (D4);
    - entry branch: `preset`/`fieldKey` present → `VALIDATION_ERROR`; `entryId`
      existence + workspace/project scope check before insert → `NOT_FOUND`;
    - retention-days parse: blank/NaN → 30;
    - `redactExpiredAuditData`: drop `.returning()` id materialization (count only);
    - `TEXT_PROMPT_VERSION` comment alignment (`text-v3`).
  - `src/ai/ai-profile.service.ts` — glossary `null` → `[]` both insert and conflict
    paths (D6); delete the `resolve()` alias + fix the workspace-binding comment (D8).
  - `src/content/content-types.service.ts` — `assertFieldPolicies`: `aiContextFields`
    keys must be non-`multiple` fields; rename `AI_ASSIST_FIELD_TYPES` → e.g.
    `AI_ELIGIBLE_FIELD_TYPES`.
  - `src/content/entries.service.ts` — `linkAiGenerationsToRevision`: compute
    `appliedFieldKeys` first, single UPDATE per row.
  - `src/usage/usage.service.ts` — stale `used: null` comment fix.
  - core tests (where the project keeps them; add if absent — follow the existing test
    setup): replay-of-failed-key returns original code; redacted-succeeded → 410;
    malformed-200 → failed row, no crash.
- **Shared contracts:** consumed (Phase 1), none new.
- **Verify:** `pnpm nx typecheck test lint core-service` green; manual psql check that a
  failed row carries `error_code` and finite/null (never NaN) `cost_microusd`.

### Phase 4 — gateway + auth-service

- **Why here** — depends on Phase 1 membership field and error registry.
- **Files — modify:**
  - `apps/auth-service/src/auth/auth.service.ts` (+ controller if split) —
    `validateProjectMember` response includes the project's `workspaceId` (from the
    project row it already reads).
  - `apps/api-gateway/src/auth/project.guard.ts` — stash `membership.workspaceId` on
    `req.projectWorkspaceId`.
  - `apps/api-gateway/src/content/ai.controller.ts` —
    - profile routes inject `req.projectWorkspaceId` as the TCP `workspaceId` (D5), not
      the header;
    - `PROFILE_TIMEOUT_ERROR` uses `ERROR_CODES.GATEWAY_TIMEOUT`;
    - both timeout env parses guarded: `Number.isFinite(x) && x > 0 ? x : default`.
  - `apps/api-gateway/src/common/all-exceptions.filter.ts` — 429 branch forwards the
    thrown message (burst-guard copy no longer dead).
- **Shared contracts:** consumed (Phase 1), none new.
- **Verify:** `pnpm nx typecheck lint build api-gateway auth-service` green; smoke with
  mismatched `X-Workspace-Id` header → `ai_profiles.workspace_id` still the project's
  true workspace; `AI_GATEWAY_TIMEOUT_MS=` (blank) still generates normally.

### Phase 5 — client correctness

- **Why here** — backend surfaces fixed; UI bugs next, before the Phase-6 refactor so
  fixes stay reviewable (spec rule).
- **Files — create:**
  - `apps/client/src/components/editor/extensions.ts` — single exported TipTap extension
    array (StarterKit + Link + MediaImage).
- **Files — modify:**
  - `src/components/editor/rich-text-editor.tsx` — import the shared array.
  - `src/components/content/ai-panel.tsx` —
    - all four local `[StarterKit, …]` arrays → shared import (**P1**: fixes
      richtext-image false-empty + Append deletion);
    - retry: terminal failure → "Try again" button with a **new** `requestId`;
      same-key retry link only in the stop-waiting/409 state (D2);
    - target selector disabled while busy; preview filtered by `result.targetKey`;
    - one shared busy state across compose + field flows (no self-429);
    - abort in-flight on unmount.
  - `src/components/content/content-editor.tsx` — single `AiPanel` instance in a
    responsive container (kill the desktop+mobile double mount); revision restore clears
    panel state via signal prop/key.
  - `src/components/content/ai-profile-panel.tsx` — query key
    `['ai-profile', projectId]` + invalidate on scope change; client `maxLength` caps
    (2 000 / 80 / 80).
- **Shared contracts:** none (client mirrors).
- **Verify:** `pnpm nx typecheck lint build client` green; manual — richtext field with
  image: Refine enabled + Append preserves image; failed generation → Try again
  succeeds; stop-waiting → same-key retry visible; desktop→mobile panel keeps state;
  project switch shows the right profile.

### Phase 6 — client UX completion + panel refactor + docs

- **Why here** — last: behavior-preserving split and presentational changes on top of a
  green, fixed panel.
- **Files — create (inside `src/components/content/`):**
  - `ai-panel/compose-section.tsx`, `ai-panel/field-flow.tsx`,
    `ai-panel/rich-text-preview.tsx`, `ai-panel/inline-diff.tsx`,
    `ai-panel/panel-shell.tsx`, `ai-panel/richtext.ts` — extracted from `ai-panel.tsx`;
    each unit <200 lines; `ai-panel.tsx` becomes the thin composition root.
- **Files — modify:**
  - panel units —
    - compose: expandable full per-field preview; undo snapshot of overwritten form-data
      slice; error state retry affordance; truncated notice with remediation copy;
    - compose placement: hero + open on empty entry, collapsed on filled;
    - preset chips rendered in Generate (click → Refine + preset);
    - freeform refine requires non-empty instruction;
    - alternates append the matching assistant turn to `histories`;
    - undo disabled after manual edit of the applied field (dirty tracking);
    - `errMsg` → module constant, compose-aware message.
  - `content-editor.tsx` / field rows — sparkle affordance per Tier-1 field (sets
    `targetKey`, focuses panel); dropdown stays as fallback.
  - Docs: `specs/21-ai-generation-redesign.md` refinement-log corrections (D1 caps,
    `text-v3`, D8 no cache); `doc/ai-governance.md` (guardrail repair = third second-call
    type; `error_code` column; `AI_RESULT_EXPIRED`); `doc/api-reference.md` (new codes,
    profile workspace resolution); `doc/status.md` hardening note.
- **Shared contracts:** none.
- **Verify:** `pnpm nx build lint typecheck client` green; manual DoD walk from spec 22
  Wave 3 (empty entry → Draft hero; expandable preview; undo works and disables after
  manual edit; sparkle targets panel; chips visible in Generate).

Commits per phase (backend Phases 1–4, frontend 5–6, docs folded into their phase or a
final `docs:` commit) — one-line Conventional Commits, no co-author trailer, never
`git add -A` across apps/client and backend.

## Risks / open questions

- **Panel split regression** (Phase 6) — mitigated: behavior-preserving extraction after
  fixes, gated on Phase 5's green checks; if it slips, it's independently droppable.
- **`ProjectMembership.workspaceId`** is a cross-service contract change — additive
  (older consumers ignore it); deploy auth-service before gateway relies on it.
- **Replay semantics change** (D2/D3/D4) alters responses for retried keys — pre-ship,
  no clients to migrate; admin-panel does not consume the generate route.
- **NaN fix depends on both ends** — Phase 2 (wire) and Phase 3 (client validation) must
  both land before a deploy; repo-wise they're in the same push, so no window.
- Cold-cache `pnpm nx typecheck` flake observed once during review (parallel target race)
  — rerun before trusting a red.

## Out of scope

Streaming, RAG/embeddings, async job queue, image/media generation, translation ops,
token-based plan limits, model routing, admin AI cost console, Redis burst throttle —
all unchanged per spec 21/22 deferrals.

## Definition of done

Mirrors spec 22's DoD, phase-mapped:

- [ ] P1 verification: migration 0013 applied (`error_code`, `text-v3` default).
- [ ] P2: `uv run pytest` green incl. route test asserting camelCase error `usage`
      (red pre-fix); snapshot test runs once with 6 assertions.
- [ ] P3: core typecheck/test/lint green; failed rows carry `error_code`, never NaN cost;
      failed-key retry returns original status class; redacted-succeeded → 410.
- [ ] P4: mismatched workspace header cannot mis-stamp `ai_profiles`; blank timeout envs
      fall back to defaults; auth+gateway typecheck/lint/build green.
- [ ] P5: richtext-with-image Refine + Append correct; Try-again-after-failure succeeds;
      single panel state across breakpoints; profile editor project-correct.
- [ ] P6: panel units <200 lines; compose hero/preview/undo; sparkle targeting; preset
      chips from Generate; client build/lint/typecheck green; spec 21 refinement log,
      ai-governance, api-reference, status updated.
