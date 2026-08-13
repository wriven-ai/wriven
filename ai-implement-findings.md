# AI Content Generation — Architecture & Implementation Review

Reviewed against specs/19 → 20 → 21, plans/14, `doc/ai-governance.md`,
`doc/status.md`, and the shipped code (core-service `ai/`, ai-service `app/`,
gateway `content/ai.*`, shared contracts, client AI panel/editor/usage UI).
Ai-service test suite passes (25 tests). Lint is clean on core, gateway, client.

---

## 1. Architecture / decision model — was it right?

**Yes, on nearly every structural decision.** The reasoning is sound and consistent:

- **The `AiClient` seam + Python extraction (spec 20)** — correct. It is the only
  NestJS↔non-NestJS hop in the system, keeps the `openai` SDK and the provider key
  out of core, and leaves core purely DB-bound (quota, audit, cost). The
  spec-19 "in-process first, extract later" sequencing also paid off — the seam
  made the extraction a one-day swap.
- **Core owns quota/audit; ai-service owns prompt/provider** — correct split. The
  expensive invariants (atomic reserve, idempotent replay, metering) live next to
  the DB; the churn-prone parts (prompts, temperature, retries) live in Python.
- **Atomic quota via `pg_advisory_xact_lock` + pending-row reservation** — right.
  Insert-pending-then-count closes the concurrent-count race; the stale-reservation
  reclaim (5 min) handles process death. Fail-closed entitlement lookup
  (`AI_QUOTA_UNAVAILABLE`) for a money-burning feature is correct.
- **Idempotency (`requestId` + `requestHash` + persisted replay)** — strong. The
  `(workspace, creator, idempotency_key)` unique index, hash-mismatch → 409, and
  in-progress → 409 make retry-safe LLM calls.
- **Derived eligibility (dropping `aiAssist`/`aiOperations`)** — right product call.
  Sensitivity (`aiPrivate`) is the only real per-field decision; eligibility is
  `Tier-1 ∧ !multiple ∧ !aiPrivate`. One visible control beats four.
- **Typed `AiOutput` union + whole-entry compose = one quota unit** — right model.
  Unblocks multi-field generation without breaking metering. Folding `option` into
  `scalar` (a select value is a constrained scalar) was a good simplification.
- **Cost keyed on the returned model, `*:free → 0`, `null` = unknown with a
  `cost.complete` honesty flag** — the correct discipline for `openrouter/free`
  where the model varies per call.
- **Prompt snapshot tests + `promptVersion` + `extra="ignore"` request models** —
  the details that usually get missed, they're there.
- **Timeout ordering 30s provider < 35s core hop < 40s gateway** — deliberate and
  correct; core normally wins the race and returns a real error, the gateway
  timeout is only the backstop.
- **Governance fencing** (sibling context + draft + voice profile fenced as
  UNTRUSTED DATA, `aiPrivate` never a target or context source, redaction keeps
  financial metadata) — matches `doc/ai-governance.md` and is enforced in code.

## 2. Bugs / issues found

### Real issues

1. **Select/compose "repair" is a same-prompt retry, not a repair.**
   `generator.py` retries with the identical `messages` on a structured-output
   miss — no failure feedback ("your answer was invalid, respond with ONLY …").
   Free models that miss once usually miss the identical prompt again. This is the
   highest-impact bug for end users on `openrouter/free`. Fix: append a correction
   turn on the retry.

2. **Typecheck is red — spec 21 DoD not met.**
   `pnpm nx typecheck` fails with TS1272 (`isolatedModules` +
   `emitDecoratorMetadata`) across ~15 files (admin services, `app.service.ts`,
   `core-entitlements.service.ts`, gateway controllers). The branch's
   `tsconfig.base.json` adds `experimentalDecorators`/`emitDecoratorMetadata` at the
   base level — redundant (every `tsconfig.app.json` already sets them) and dead
   config; drop those two lines. The TS1272 errors themselves appear pre-existing
   on main (the failing files and app tsconfigs are unchanged by this branch), but
   they must be fixed (`import type` on the affected constructor deps) to get the
   DoD green.

3. **Workspace stats grid never renders `aiText`.**
   The backend sends `WorkspaceStatsView.aiText: AiUsageStats` and client types
   mirror it, but `workspace-stats-grid.tsx` doesn't render it — and shows a stale
   footer: "Bandwidth, AI text & image usage — not yet reported." AI text *is*
   reported now. The `/usage` page card does it correctly (tokens + cost with the
   unpriced handling); the stats grid should show the same block and drop that line.

4. **No timeout on the gateway profile routes.**
   `generate` has the 40s backstop; `GET`/`PATCH /content/ai/profile` use bare
   `firstValueFrom` — a wedged core pins a gateway worker with no deadline. Cheap
   fix, same `.pipe(timeout(...))` pattern.

5. **`AiBurstGuard` map never prunes.**
   Per-workspace arrays are never removed after the window empties — unbounded
   (tiny) memory growth. One-line fix: delete the key when `recent.length === 0`.

6. **`ai_profiles` migration lacks the workspace index** the spec called for
   (only a project-unique index exists). Reads go by `projectId` so it's
   practically fine, but it's a spec deviation.

### Minor / by-design (noted, no action strictly needed)

- `reconstructOutput` returns an empty record on corrupt stored JSON — a corrupted
  row would replay as an empty compose preview. Acceptable; a log line would help.
- `ai_generations.prompt_version` column default is still `text-v1` — documented as
  intentional (finalize always sets explicit), but a one-line migration to fix the
  default removes the trap.
- Compose `truncated` rarely surfaces: `finish_reason:'length'` usually means
  unparseable JSON → repair miss → 502, so the panel's truncation notice mostly
  applies to field ops. Fine.
- Compose accepts and forwards `entryId` + `history` but Python never uses them
  (no sibling context, no history in `build_compose_messages`). Dead payload —
  strip in core or document.

### Verified clean (no bugs)

- `render.yaml`: `wriven-ai` pserv present; `INTERNAL_SECRET` `sync: false` on both
  core and ai-service; `AI_API_KEY` only on ai-service; `AI_SERVICE_TIMEOUT_MS` >
  provider `AI_TIMEOUT_MS`; env docs match `.env.example`.
- Error catalog: all six AI codes exist in `@wriven/contracts/errors.ts` and map
  cleanly through the client allowlist (`AI_NOT_CONFIGURED`, `AI_GENERATION_FAILED`,
  `AI_INPUT_TOO_LARGE` passthrough; everything else collapses safely).
- Entry-save provenance: `linkAiGenerationsToRevision` verifies ownership, scope,
  status, and single-apply before linking; compose records `applied_field_keys`.
- ai-service tests: 25/25 pass, including the TS↔Python `OPERATIONS` parity test,
  compose repair, select retry aggregation, and prompt snapshots.
- Retention job (`redactExpiredAuditData`) nulls only `output` + `request_hash` and
  preserves tokens/cost/model/latency — matches the governance rule.

## 3. Missing parts (spec vs shipped)

- Stats grid rendering of `aiText` (bug #3 above).
- The `ai_profiles` workspace index (bug #6 above).
- Contract parity test covers `OPERATIONS` only — extend it to assert the request
  shape field names (`compose_fields`, `target_kind`, …) so a camelCase rename on
  either side fails CI instead of production.

## 4. Would I design it the same way? What would I do differently?

**I would keep the design almost exactly as-is.** The three-layer split, the seam,
the reservation protocol, and the cost model are defensible and well-executed.
My changes would be:

1. **Repair with feedback** (bug #1) — the single highest-leverage quality fix.
2. **Async queue as the next step, not streaming.** The `ai_generations` schema is
   already the durable hand-off record (pending/succeeded/failed + idempotency) —
   it was literally designed for a worker pool. Streaming needs SSE through two
   hops and mostly buys polish; a queue buys timeout independence, retries, and
   bulk compose.
3. **Stronger cross-language drift protection** — extend the parity test to the
   full request shape, not just the operation enum.
4. **Drop the base-tsconfig decorator flags and get typecheck green.**
5. **Long-term: collapse core→ai-service into a queue message.** Three hops
   (gateway→core TCP→ai HTTP) for a 30s synchronous call is fine at MVP volume,
   but the hop count is what will hurt first under load.

One judgment call I'd revisit: `applied_field_keys` records the **generated** key
set, not the exact applied subset (the save DTO doesn't carry it — documented
honestly in the spec). Fine for MVP, but if the UI ever shows "which AI fields are
in this entry," the data model is slightly under-specified there.

## Verdict

The architecture is right, the metering invariants are genuinely well-engineered,
and the bugs are small — the same-prompt retry (#1) being the only one with real
user impact. Fix the retry feedback, drop the redundant tsconfig lines, render
`aiText` in the stats grid, and add timeouts on the profile routes — then this is
ready for MVP.
