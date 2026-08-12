# Plan: Extract AI Generation to Python ai-service

> Status: drafted · Executes: spec 20 (`specs/20-ai-service-extraction.md`) · Supersedes: -

## Goal

Move all LLM concerns (prompt build, operation templates, temperature, `select`
validation/retry, provider call) from core-service into the standalone Python
FastAPI `ai-service`; core keeps only DB-bound work (quota, audit, field validation)
and calls ai-service over HTTP (axios) behind the reshaped `AiClient` seam. Gateway,
DTO, message pattern, and frontend unchanged.

## Current state

- **core-service** (`apps/core-service/src/ai/`) runs AI in-process: `ai.service.ts`
  (orchestration + quota reserve + finalize + `select` retry), `ai-prompt.ts`
  (prompts/temperature), `ai-provider.interface.ts` (`AiProvider` seam), `ai.controller.ts`
  (`@MessagePattern(AI_PATTERNS.GENERATE)`), `providers/openai-compatible.provider.ts`
  (Node `openai` SDK Chat Completions), `ai.module.ts`. Wired in
  `apps/core-service/src/app/app.module.ts`.
- **gateway** (`apps/api-gateway/src/content/ai.controller.ts` + `ai-burst.guard.ts`) —
  forwards to `core.ai.generate` with JWT + Workspace + Project + Permission + burst guards.
- **DB** — `ai_generations` in `core_svc`; entitlements `CoreEntitlementsService.aiTextLimit()`.
- **contracts** — `AI_PATTERNS.GENERATE`, `AiGenerateDto`, `AiGenerateResult`, `AiOperation`,
  `AiTurn`, `AI_GENERATION_FAILED`, `AI_NOT_CONFIGURED`, `FieldDef.aiAssist` — all shipped.
- **ai-service skeleton** — FastAPI `/health` + `/` only; Dockerfile copies a missing
  `requirements.txt`; `.env.example` has stale R2 vars + `OPENAI_*` naming drift.
- **render.yaml** — no ai-service; core has no `AI_SERVICE_URL`.
- **core deps** — `openai@^7.4.0` present; no HTTP client.
- `openai` SDK used **only** in `providers/openai-compatible.provider.ts` — clean removal.

This plan starts from there. The seam (`AiProvider`) was built for exactly this swap.

## Phases

### Phase 1 — Python ai-service: real generation endpoint (standalone)

- **Why here:** first — unblocks Phase 2. Builds the Python service as a fully working,
  independently-testable endpoint before core points at it. No core change, so the system
  stays on in-process AI the whole phase; nothing breaks if this lands alone.
- **Files — create:**
  - `apps/ai-service/app/__init__.py` + `apps/ai-service/app/routers/__init__.py` — package markers.
  - `apps/ai-service/app/config.py` — `Settings` (`pydantic-settings` `BaseSettings`):
    `ai_api_key`, `ai_base_url` (default `https://openrouter.ai/api/v1`), `ai_model`
    (default `openrouter/free`), `ai_timeout_ms` (default 30000), `ai_headers` (optional
    JSON string), `internal_secret`, `port` (default 8000). One `settings` singleton.
  - `apps/ai-service/app/exceptions.py` — `NotConfigured`, `ProviderError`,
    `SelectMissError` + FastAPI exception handlers mapping each to JSON `{code, message}`
    + status (`AI_NOT_CONFIGURED` 503, `AI_GENERATION_FAILED` 502). Short, leak-free
    `message` (port `shortReason` discipline).
  - `apps/ai-service/app/security.py` — `verify_internal_secret` dependency: compares
    `X-Internal-Secret` header to `settings.internal_secret`; `401 INVALID_INTERNAL_SECRET`
    on mismatch/missing.
  - `apps/ai-service/app/schemas.py` — Pydantic: `FieldDefIn` (`key`, `label`,
    `type ∈ {text,richtext,select}`, `options?`), `SiblingValue`, `AiTurnIn`,
    `GenerateRequest` (`operation`, `contentTypeName`, `field`, `siblingValues?`,
    `history?`, `instruction?`, `tone?`), `UsageOut`, `GenerateResponse` (`text`, `model`,
    `usage`), `ErrorResponse`. `operation` validated against a literal tuple mirroring
    `AI_OPERATIONS` in `libs/shared/contracts/src/lib/dto/ai.dto.ts` (7 values) — **keep
    in sync**.
  - `apps/ai-service/app/prompts.py` — direct port of
    `apps/core-service/src/ai/ai-prompt.ts`: `system_prompt(ctx)` (CMS-assistant rule,
    richtext→semantic-HTML tag allowlist `h2,h3,p,ul,ol,li,blockquote,a,strong,em,code`,
    `select` options constraint, `<entry_context>` injection-fence with "UNTRUSTED DATA"
    instruction, `truncate(s, 500)`), `user_prompt(operation, ctx)` (same 7-operation
    template map + tone/instruction), `temperature_for(operation, field_type)` (0.3 for
    `select`/`rewrite`, else 0.7), `build_messages(ctx)` (system + history + user).
  - `apps/ai-service/app/llm.py` — `LlmClient` wrapping the `openai` SDK, built once from
    `settings` (`api_key`, `base_url`, `timeout`, `default_headers` from parsed
    `ai_headers`); `configured()` (key present) + `chat(messages, temperature)` →
    `(text, model, usage)`. Raises `ProviderError` on upstream failure/timeout/429. SDK
    imported **only here**.
  - `apps/ai-service/app/generator.py` — `generate(req)`: build messages via `prompts` →
    `LlmClient.chat` → `select` validate ∈ `options` + retry once → raise `SelectMissError`
    on second miss; raise `NotConfigured` if no key; return `(text, model, usage)`.
  - `apps/ai-service/app/routers/health.py` — `GET /health` + `GET /`.
  - `apps/ai-service/app/routers/generate.py` — `POST /generate` (dependency
    `verify_internal_secret`) → `generator.generate(req)` → `GenerateResponse`. Domain
    errors mapped by the `exceptions.py` handlers.
  - `apps/ai-service/requirements.txt` — pinned: `fastapi>=0.104`, `uvicorn[standard]>=0.24`,
    `pydantic>=2.4`, `pydantic-settings>=2.0`, `python-dotenv>=1.0`, `openai>=1.40`. Keep
    in sync with `pyproject.toml`.
- **Files — modify:**
  - `apps/ai-service/main.py` — replace skeleton with app factory: build `FastAPI`,
    register exception handlers, mount `health` + `generate` routers; keep
    `if __name__ == "__main__": uvicorn.run(...)`.
  - `apps/ai-service/pyproject.toml` — add `openai` + `pydantic-settings` to `dependencies`.
  - `apps/ai-service/Dockerfile` — fix three pre-existing skeleton bugs so the image
    actually runs as non-root:
    1. WORKDIR/COPY — `COPY apps/ai-service ./src` → `COPY apps/ai-service ./` so
       `main.py` → `/app/main.py` and `uvicorn main:app` resolves.
    2. `addgroup`/`adduser` busybox flags (`-S -g`) → Debian long-form (`--system --gid`),
       which is what `python:*-slim` provides.
    3. Deps installed to `/root/.local` (700) are unreadable by the non-root user → install
       with `pip --target=/opt/deps` + `ENV PYTHONPATH=/opt/deps` + run `python -m uvicorn`.
    Also wire the already-installed `dumb-init` as `ENTRYPOINT` for signal forwarding.
  - `apps/ai-service/.env.example` — replace stale `OPENAI_*` + R2 vars with `AI_API_KEY`,
    `AI_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_HEADERS`, `INTERNAL_SECRET`, `PORT`.
  - `apps/ai-service/.env` (gitignored) — real local values mirroring `.env.example`.
- **Shared contracts:** none.
- **Verify:**
  - `cd apps/ai-service && pip install -r requirements.txt && uvicorn main:app --reload` →
    `GET /health` → `{"status":"ok"}`.
  - `curl POST /generate` with valid `X-Internal-Secret` + a `richtext` field +
    `operation:"generate"` → `{text, model, usage}` with non-zero `totalTokens`.
  - Missing/wrong `X-Internal-Secret` → `401`.
  - `AI_API_KEY` unset → `503 AI_NOT_CONFIGURED`, service still booted.
  - Bad `AI_MODEL` → `502 AI_GENERATION_FAILED`, no provider payload in body.
  - `docker build -f apps/ai-service/Dockerfile .` succeeds.

### Phase 2 — core-service: swap the seam to the HTTP client

- **Why here:** gated on Phase 1 (a working ai-service to call). This is the atomic swap —
  core stops building prompts and calling the Node `openai` SDK; instead it POSTs context
  to `AI_SERVICE_URL`. Repo is green at the commit edge (typecheck/lint/build clean),
  AI works end-to-end against the Phase-1 Python service.
- **Files — create:**
  - `apps/core-service/src/ai/ai-client.interface.ts` — `AI_CLIENT` injection token;
    `AiGenerateRequest` (the context payload: `operation`, `contentTypeName`,
    `field: {key,label,type,options?}`, `siblingValues?`, `history?`, `instruction?`,
    `tone?`); `AiClientResult` (`{text, model, usage}`); `AiClientError` (status-bearing);
    `AiClient` interface: `configured(): boolean` + `generate(req): Promise<AiClientResult>`.
  - `apps/core-service/src/ai/ai-service.client.ts` — `AiClient` impl via **axios**:
    `axios.create({ baseURL: AI_SERVICE_URL, timeout: AI_TIMEOUT_MS ?? 30000, headers:
    {'X-Internal-Secret': INTERNAL_SECRET} })`; `POST /generate` with `AiGenerateRequest`;
    return `{text, model, usage}`; on `AxiosError` read `err.response?.data` for
    `{code, message}` and apply a **code allowlist** — if `code` is `AI_NOT_CONFIGURED` or
    `AI_GENERATION_FAILED`, throw `AiClientError(code, message, status)` (passthrough, so
    Python's `AI_NOT_CONFIGURED` survives the hop); anything else (401 secret mismatch,
    unmapped 5xx, no body) → `AiClientError('AI_GENERATION_FAILED', <generic>, status)`;
    network/timeout (no `err.response`) → `AiClientError('AI_GENERATION_FAILED',
    'AI generation failed.')`. Never rethrow raw axios errors. `configured()` =
    `AI_SERVICE_URL` && `INTERNAL_SECRET` both set.
- **Files — modify:**
  - `apps/core-service/src/ai/ai.service.ts` — inject `AI_CLIENT` (drop `AI_PROVIDER`);
    replace the `buildMessages`/`temperatureFor` call + the in-process `provider.generate`
    + the entire `select` retry block with: build `AiGenerateRequest` from the existing
    context (already assembled — `contentTypeName`, `field`, `siblingValues`, `history`,
    `tone`, `instruction`) and `await this.client.generate(req)`. Keep unchanged: field
    Tier-1/`aiAssist` validation, `configured()`→`AI_NOT_CONFIGURED`, `reserveQuota`
    (advisory lock + pending row + count vs `aiTextLimit`), `finalize` (succeeded/failed +
    token totals), `remaining` computation, `siblingValues` DB fetch. Map `AiClientError`
    → `rpcError(err.code, err.message)` (codes already match the contract).
  - `apps/core-service/src/ai/ai.module.ts` — bind
    `{ provide: AI_CLIENT, useClass: AiServiceClient }` (drop `AI_PROVIDER`/`OpenAiCompatibleProvider`).
  - `apps/core-service/package.json` — remove `openai`; add `axios`.
  - `apps/core-service/.env` + `.env.example` — remove `AI_API_KEY`, `AI_BASE_URL`,
    `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_HEADERS`; activate `AI_SERVICE_URL`
    (default `http://localhost:8000`) + `INTERNAL_SECRET`.
- **Files — delete:**
  - `apps/core-service/src/ai/ai-prompt.ts`
  - `apps/core-service/src/ai/ai-provider.interface.ts`
  - `apps/core-service/src/ai/providers/openai-compatible.provider.ts`
  - `apps/core-service/src/ai/providers/` (directory once empty)
- **Shared contracts:** none (`AiGenerateRequest` is local to core + mirrored as Pydantic;
  `AI_PATTERNS`, DTOs, errors unchanged).
- **Verify:**
  - `pnpm nx typecheck core-service` clean; `grep -r "from 'openai'" apps/core-service/src`
    → empty; `grep -r "buildMessages\|temperatureFor\|AI_PROVIDER" apps/core-service/src`
    → empty.
  - `pnpm nx lint core-service` + `pnpm nx build core-service` clean.
  - End-to-end (core + gateway + Phase-1 ai-service running, real `AI_API_KEY` on
    ai-service): `POST /api/v1/content/ai/generate` on a `richtext` field →
    `{text, model, usage, remaining}` (same shape as before).
  - Multi-turn: second call with `history` + `instruction:"shorten"` → shorter refinement.
  - `select` field: `text ∈ options`; double-miss → `AI_GENERATION_FAILED` (502) + `failed`
    row + no quota charge.
  - Quota: artificially-low `aiTextRequestsPerMonth` → (N+1)th call →
    `PLAN_LIMIT_REACHED` (403), no HTTP call to ai-service.
  - `AI_SERVICE_URL` dead port → `AI_GENERATION_FAILED` (502) + `failed` row.
  - `AI_SERVICE_URL`/`INTERNAL_SECRET` unset → `AI_NOT_CONFIGURED` (503); core still boots.
  - `pnpm nx typecheck api-gateway client` clean (no gateway/client change — sanity).

### Phase 3 — Deploy config + render.yaml

- **Why here:** gated on Phase 2 (the env rename must match what core now reads). Wires
  the new service into the deploy topology without secret values.
- **Files — modify:**
  - `render.yaml` — add `wriven-ai` (`type: pserv`, `runtime: docker`,
    `dockerfilePath: ./apps/ai-service/Dockerfile`, `dockerContext: .`, `plan: starter`,
    `region: oregon`) with env `PORT=8000`, `AI_API_KEY` (sync:false), `AI_BASE_URL`,
    `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_HEADERS` (sync:false), `INTERNAL_SECRET` (sync:false).
    Add to `wriven-core`: `AI_SERVICE_URL=http://wriven-ai:8000` + `INTERNAL_SECRET`
    (sync:false). Keep `INTERNAL_SECRET` per-service (not in the shared group) so
    auth/gateway don't receive it.
  - `apps/ai-service/Dockerfile` — no further change (all three skeleton bugs fixed in
    Phase 1); sanity-check the `CMD` + `/health` healthcheck still match the package layout.
- **Shared contracts:** none.
- **Verify:**
  - `render.yaml` parses (Render Blueprint validation, or `yq` lint) — no secret values
    committed (`grep -niE "key|secret|password" render.yaml` shows only `sync: false`
    declarations and non-sensitive defaults).
  - `INTERNAL_SECRET` appears only on `wriven-ai` and `wriven-core`, both `sync: false`.

### Phase 4 — Docs (land with the code)

- **Why here:** last — code wins, so docs flip only after the move works. Maps to the
  spec's "Docs land with the code" rule and the DoD's doc checklist.
- **Files — modify** (flip every "in-process / deferred" statement about generation to
  "extracted / real service"):
  - `doc/status.md` — "Extract to Python ai-service" 🔲→✅; section header + intro
    describe ai-service as live; Tier-1 row notes it now runs in Python.
  - `doc/architecture.md` — topology diagram + "Inter-service communication" + Ports
    table: ai-service `:8000` is real (internal HTTP); core→ai-service is the live HTTP hop.
  - `doc/overview.md` — service table rows for core (drop "AI generation in-process") and
    ai-service (real service, not deferred skeleton); monorepo tree comment.
  - `doc/core-service/core-service.md` — "AI generation" message-pattern note, env section
    (drop `AI_*` provider vars; show `AI_SERVICE_URL` + `INTERNAL_SECRET`), "Not yet built"
    (remove "Extraction to ai-service").
  - `doc/deployment.md` — topology table ai-service row (real `pserv` HTTP :8000);
    per-service env table (move `AI_*` to ai-service; add `AI_SERVICE_URL`+`INTERNAL_SECRET`
    to wriven-core); cost note (+1 starter ≈ $28/mo).
  - `doc/diagrams/00-system-overview.md` — service-comm table + notes: ai-service live,
    core→ai HTTP edge.
  - `doc/market-readiness.md` — "AI generation" section: note extraction done.
  - `doc/README.md` — one-liner about where AI runs.
  - `CLAUDE.md` — the `ai-service` bullet: no longer "deferred skeleton / runs in core";
    describe the live HTTP hop + that core holds `AI_SERVICE_URL`/`INTERNAL_SECRET`.
- **Shared contracts:** none.
- **Verify:**
  - `grep -rniE "in-process|in process|deferred skeleton" doc/ CLAUDE.md` returns nothing
    tied to AI generation (deferred-plan-downgrade etc. hits are unrelated — eyeball them).
  - `doc/status.md` shows the extraction row ✅.

## Risks / open questions

- **Prompt parity (TS→Python).** Diverging prompts = silently different output. Mitigation:
  port `ai-prompt.ts` line-for-line into `prompts.py`; keep f-string fences identical to the
  TS template literals; diff sample outputs for `generate`/`rewrite`/`select` before deleting
  the TS file. After deletion, `prompts.py` is the single source of truth.
- **`operation` enum drift.** Python literal tuple vs `AI_OPERATIONS` in contracts. Mitigation:
  comment in `schemas.py` pointing at `libs/shared/contracts/src/lib/dto/ai.dto.ts`; any future
  operation added to one must be added to the other.
- **axios error surface.** `AxiosError` has `.response.data` (non-2xx) vs no `.response`
  (network/timeout). Mitigation: one catch in `ai-service.client.ts` normalizing both to
  `AiClientError`; never rethrow raw axios errors (they can carry the request URL/headers).
- **`AI_HEADERS` parsing parity.** Core's `parseHeaders` (tolerant JSON.parse) must match
  Python's equivalent. Trivial, but keep both lenient.
- **ai-service boot resilience.** Missing `AI_API_KEY` must not crash uvicorn (per-call 503).
  Verify in Phase 1.
- **No streaming.** Out of scope — TCP gateway can't stream to the browser anyway. Non-streaming
  Chat Completions only (matches current core behavior).
- **Render pserv + HTTP.** Render Private Services carry any TCP; HTTP :8000 is fine. Confirm
  the `wriven-ai` internal hostname resolves from `wriven-core` in the same region (Render
  routes pserv by name) — if not, copy the exact internal hostname from the Connect tab into
  `AI_SERVICE_URL` (one-off deploy step, documented in `doc/deployment.md` troubleshooting).

## Out of scope

- Image generation (`media` field) — phase 2 (specs/19).
- `reference` field RAG generation.
- Streaming to the browser.
- `ai_generations` schema / quota math / metering changes.
- Gateway route / DTO / frontend changes.
- ai-service owning DB tables (never — architecture rule).
- Token-based (vs request-count) plan limits.

## Definition of done

Mirrors spec 20 DoD; each item maps to a phase Verify:
- [ ] `pnpm nx typecheck/lint/build core-service api-gateway client` clean (Phase 2/3).
- [ ] `openai` removed from core-service; `axios` added; no `openai`/`buildMessages`/
      `temperatureFor`/`AI_PROVIDER` references remain in `apps/core-service/src` (Phase 2).
- [ ] ai-service: `uvicorn main:app` → `/health` ok; `POST /generate` returns
      `{text, model, usage}`; `401` on bad secret; `503 AI_NOT_CONFIGURED` on missing key;
      `502 AI_GENERATION_FAILED` on bad model; `docker build` succeeds (Phase 1).
- [ ] End-to-end `POST /api/v1/content/ai/generate` returns the same response shape as before
      the move (Phase 2).
- [ ] `select` retry + double-miss path → `failed` row, no quota charge (Phase 2).
- [ ] Quota atomic reserve unchanged → `PLAN_LIMIT_REACHED` before any ai-service call (Phase 2).
- [ ] Burst throttle `RATE_LIMITED` (429) unchanged — gateway-side (Phase 2, sanity).
- [ ] Unreachable ai-service → `AI_GENERATION_FAILED` + `failed` row; core still boots (Phase 2).
- [ ] `render.yaml` has `wriven-ai` pserv + `AI_SERVICE_URL` on core; secrets `sync:false`
      only on ai-service + core (Phase 3).
- [ ] Docs: no "in-process / deferred" language about generation; `doc/status.md` extraction ✅
      (Phase 4).
