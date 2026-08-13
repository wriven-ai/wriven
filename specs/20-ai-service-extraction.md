# Spec: Extract AI Generation to Python ai-service

> **⚠️ SUPERSEDED by [specs/21 — AI Generation Redesign](./21-ai-generation-redesign.md).**
> The extraction seam (`AiClient`, `INTERNAL_SECRET` hop, Python prompt/select-retry)
> is retained; the request/response shapes it carries were reshaped (typed `AiOutput`,
> `compose`, per-project AI profile, `operation`/`targetKind`). Kept for history only.

> Priority: P2 · Area: cross · Status: drafted

## Overview

Extract AI content generation out of core-service (NestJS, in-process `AiModule`)
into the standalone Python/FastAPI `apps/ai-service`. Today the LLM call, prompt
building, operation templates, temperature selection, and `select` validation/retry
all live inside core-service behind an `AiProvider` seam (specs/19). The seam was
designed for exactly this move. This spec does the **fat extraction**: all LLM
concerns move to Python; core-service keeps only what is DB-bound (the
`ai_generations` table, quota reserve via `pg_advisory_xact_lock`, field
validation, sibling-value fetch). core-service's `AiProvider` becomes an HTTP
client to `ai-service`; the `core.ai.generate` TCP pattern, the gateway HTTP route,
the DTO, and the frontend are **unchanged**. This realizes the "Extract to Python
`ai-service`" 🔲 row in `doc/status.md` and turns `ai-service` from a deferred
skeleton into a real service — the **only NestJS↔non-NestJS HTTP hop** in the
system (called from core over HTTP; all NestJS↔NestJS stays TCP).

## Depends on

- [specs/19 — AI Content Generation](./19-ai-content-generation.md) — the in-process
  `AiModule` + `AiProvider` seam + `ai_generations` table + quota/audit logic being
  extracted. ✅ shipped (Tier 1).
- `apps/core-service/src/entitlements` — `CoreEntitlementsService.aiTextLimit()`.
  ✅ shipped. Unchanged.
- `apps/ai-service` (FastAPI skeleton) — exists with `/health` + Dockerfile. ✅.

## Tooling context (skills / MCP / plugins)

No domain tools available / used. This is an internal refactor moving existing
TypeScript logic to Python; no external provider API changes (same OpenAI-compatible
Chat Completions surface, same `openai` SDK — the Python edition instead of the Node
edition). Supabase MCP not relevant — **no schema change** (`ai_generations` stays in
`core_svc`, owned by core; ai-service owns no tables, per the architecture rule).
Checked: `@wriven/contracts` for reusable DTOs/types/patterns/errors (see Shared
contracts — none new); `apps/core-service/package.json` for an existing HTTP client
(none — core has no HTTP client; **axios is added** to core-service for the
core→ai-service hop).

## Scope

- In scope:
  - Python `POST /generate` on `ai-service`: receives a **context payload** (operation,
    content-type name, field def, sibling values, history, tone, instruction), builds
    the system + per-operation prompt, picks temperature, calls the LLM via the
    `openai` Python SDK, performs `select` option validation + one retry, returns
    `{ text, model, usage }`.
  - Shared `INTERNAL_SECRET` auth on the core→ai-service HTTP hop (request header).
  - core-service `AiProvider` seam reshaped to an HTTP client (`AiClient`) that POSTs
    the context to `AI_SERVICE_URL` (via **axios**) and maps non-2xx to error codes.
  - Delete from core: `ai-prompt.ts`, `providers/openai-compatible.provider.ts`, the
    `providers/` dir, and the `openai` npm dependency. Prompt/temperature/select-retry
    logic now lives only in Python.
  - Env var migration: `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` / `AI_TIMEOUT_MS` /
    `AI_HEADERS` move from core-service to ai-service; core activates `AI_SERVICE_URL`
    + `INTERNAL_SECRET`.
  - `render.yaml`: add `wriven-ai` pserv (HTTP :8000); wire `AI_SERVICE_URL` into core.
  - Fix the ai-service skeleton gaps: missing `requirements.txt` (Dockerfile copies it),
    stale R2 env vars, `OPENAI_*` vs `AI_*` naming drift.
  - Doc updates across all files that currently describe AI as "in-process / deferred"
    (committed with the code).
- Out of scope (explicitly deferred):
  - Image generation (`media` field) — still phase 2 (specs/19).
  - `reference` field RAG generation — phase 2+.
  - Streaming to the browser (still SSE/WebSocket at the gateway; TCP can't stream).
  - Any change to `ai_generations` schema, quota math, or metering — unchanged.
  - Any change to the gateway route, DTO, or frontend — unchanged.
  - Token-based (vs request-count) plan limits — unchanged.
  - ai-service owning DB tables — never (architecture rule).

## API / endpoints

- `POST /generate` (ai-service, internal HTTP :8000) — run one AI generation turn.
  Called by core-service only. **Auth:** `X-Internal-Secret: <INTERNAL_SECRET>`
  header (shared secret; verified by a FastAPI dependency). No JWT — the gateway
  already validated identity before core was called, and core injects `userId` into
  its own DB row; ai-service trusts core.

  Request body (`AiGenerateRequest`, JSON):
  ```jsonc
  {
    "operation": "generate|expand|shorten|rewrite|tone|summarize|continue",
    "contentTypeName": "Post",
    "field": { "key": "body", "label": "Body", "type": "text|richtext|select", "options": ["..."] },
    "siblingValues": [{ "label": "Title", "value": "Hello" }],
    "history": [{ "role": "user", "content": "..." }],
    "instruction": "make it punchier",
    "tone": "friendly"
  }
  ```
  - `field.options` present only for `select`. `siblingValues`/`history`/`instruction`/
    `tone` optional.

  Response 200 (`{ text, model, usage }`):
  ```jsonc
  {
    "text": "...",
    "model": "openrouter/auto",
    "usage": { "promptTokens": 120, "completionTokens": 80, "totalTokens": 200 }
  }
  ```

  Error responses (JSON `{ code, message }`, status carried by the code):
  - `503 AI_NOT_CONFIGURED` — provider key missing in ai-service env.
  - `502 AI_GENERATION_FAILED` — provider error / timeout / upstream 429 / `select`
    retry-miss.
  - `401 INVALID_INTERNAL_SECRET` — missing/mismatched `X-Internal-Secret`.

  core-service maps these 1:1 to the existing `@wriven/contracts` error codes (same
  names) and to `AI_GENERATION_FAILED` for any unexpected non-2xx.

- `GET /health` (ai-service) — unchanged (already on the skeleton).

No new public gateway endpoints. `POST /api/v1/content/ai/generate` is unchanged.

## Shared contracts (@wriven/contracts)

No new shared contracts. `AI_PATTERNS.GENERATE`, `AiGenerateDto`, `AiGenerateResult`,
`AiOperation`, `AiTurn`, `AI_GENERATION_FAILED`, `AI_NOT_CONFIGURED`, and
`FieldDef.aiAssist` are all reused unchanged. The core→ai-service payload
(`AiGenerateRequest`) is a **cross-language internal boundary** (TypeScript ↔ Python),
not a contract shared between NestJS services, so it is defined locally in core-service
and mirrored as a Pydantic model in ai-service — not added to `@wriven/contracts`.

## Database / schema

No schema changes. `ai_generations` stays in `core_svc`, owned and migrated by
core-service. ai-service owns no tables and makes no DB connections (per the
architecture rule: gateway + ai-service own no tables).

## Backend changes

### ai-service (FastAPI, Python) — modular package layout
Package under `apps/ai-service/app/` (router/service/config separation, mirrors the
NestJS module discipline; leaves room for image-gen / RAG routers later). `main.py`
at the service root is the app factory + uvicorn entry; everything else lives in the
`app` package.

- **Create** `apps/ai-service/main.py` (replace skeleton) — app factory: builds the
  `FastAPI` instance, CORS off (internal only), registers exception handlers, mounts
  the `health` + `generate` routers. Also the `uvicorn` entrypoint (`if __name__ ==
  "__main__"`).
- **Create** `apps/ai-service/app/__init__.py` — package marker.
- **Create** `apps/ai-service/app/config.py` — `Settings` (`pydantic-settings`
  `BaseSettings`): `ai_api_key`, `ai_base_url` (default `https://openrouter.ai/api/v1`),
  `ai_model` (default `openrouter/free`), `ai_timeout_ms` (default 30000), `ai_headers`
  (optional JSON string), `internal_secret`, `port` (default 8000). Instantiate one
  `settings` singleton.
- **Create** `apps/ai-service/app/exceptions.py` — domain errors
  (`NotConfigured`, `ProviderError`, `SelectMissError`) + FastAPI exception handlers
  mapping each to the JSON `{code, message}` + status contract below.
- **Create** `apps/ai-service/app/security.py` — `verify_internal_secret` FastAPI
  dependency: compares `X-Internal-Secret` header to `settings.internal_secret`; raises
  `401 INVALID_INTERNAL_SECRET` on mismatch/missing.
- **Create** `apps/ai-service/app/schemas.py` — Pydantic models mirroring the request/response:
  `FieldDefIn` (`key`, `label`, `type ∈ {text,richtext,select}`, `options?`),
  `SiblingValue`, `AiTurnIn`, `GenerateRequest` (`operation`, `contentTypeName`, `field`,
  `siblingValues?`, `history?`, `instruction?`, `tone?`), `UsageOut`, `GenerateResponse`
  (`text`, `model`, `usage`), `ErrorResponse`. `operation` validated against a literal
  tuple mirroring `AI_OPERATIONS` in `@wriven/contracts` (7 values — **keep in sync**).
- **Create** `apps/ai-service/app/prompts.py` — direct port of `ai-prompt.ts`:
  `system_prompt(ctx)` (CMS-assistant rule, richtext→semantic-HTML tag allowlist,
  `select` options constraint, `<entry_context>` injection-fence with "UNTRUSTED DATA"
  instruction, `truncate(s, 500)`), `user_prompt(operation, ctx)` (7-operation template
  map + tone/instruction), `temperature_for(operation, field_type)` (0.3 for
  `select`/`rewrite`, else 0.7), `build_messages(ctx)` (system + history + user).
  Byte-for-behavior parity with the TS original.
- **Create** `apps/ai-service/app/llm.py` — `LlmClient` wrapping the `openai` Python SDK:
  constructed once from `settings` (`api_key`, `base_url`, `timeout`, `default_headers`
  from parsed `ai_headers`); `configured()` (key present) + `chat(messages, temperature)`
  returning `(text, model, usage)`. Raises `ProviderError` on upstream failure/timeout/429.
  The SDK is imported **only here** — the single LLM seam in Python (mirrors core's old
  provider discipline).
- **Create** `apps/ai-service/app/generator.py` — `generate(req)` orchestrator: builds
  messages via `prompts` → calls `LlmClient.chat` → for `select`, validates output ∈
  `options`, retries once, raises `SelectMissError` on second miss → returns
  `(text, model, usage)`. Raises `NotConfigured` if `LlmClient` has no key.
- **Create** `apps/ai-service/app/routers/__init__.py` — package marker.
- **Create** `apps/ai-service/app/routers/health.py` — `GET /health` + `GET /`
  (kept from skeleton).
- **Create** `apps/ai-service/app/routers/generate.py` — `POST /generate`
  (dependency `verify_internal_secret`) → call `generator.generate(req)` → return
  `GenerateResponse`. Domain errors map to the error contract via the handlers in
  `exceptions.py`.
- **Create** `apps/ai-service/requirements.txt` — pinned: `fastapi>=0.104`,
  `uvicorn[standard]>=0.24`, `pydantic>=2.4`, `pydantic-settings>=2.0`,
  `python-dotenv>=1.0`, `openai>=1.40`. **Keep in sync** with `pyproject.toml`.
- **Modify** `apps/ai-service/pyproject.toml` — add `openai` + `pydantic-settings` to
  dependencies (mirror of `requirements.txt`; pyproject stays the source of truth for
  tooling).
- **Modify** `apps/ai-service/Dockerfile` — fix the WORKDIR bug: the skeleton does
  `WORKDIR /app` + `COPY apps/ai-service ./src` + `CMD ["uvicorn","main:app"]`, so
  `main.py` lands at `/app/src/main.py` and uvicorn can't resolve `main:app` from
  `/app`. Copy the service contents to `/app` directly (`COPY apps/ai-service ./`) so
  `main.py` → `/app/main.py` and `app/` → `/app/app/`, and `uvicorn main:app` resolves.
  Keep the `/health` healthcheck.
- **Modify** `apps/ai-service/.env.example` — replace stale `OPENAI_*` names and R2 vars
  with the `AI_*` set + `INTERNAL_SECRET` + `PORT` (drop R2 — ai-service never touches
  object storage).

### core-service (NestJS TCP :5002)
- **Create** `apps/core-service/src/ai/ai-client.interface.ts` — the reshaped seam:
  `AI_CLIENT` injection token, `AiClientError` (status-bearing), the
  `AiGenerateRequest` interface (the context payload), and `AiClient` interface with
  `configured(): boolean` + `generate(req): Promise<{ text; model; usage }>`.
- **Create** `apps/core-service/src/ai/ai-service.client.ts` — `AiClient` impl using
  **axios** to `POST ${AI_SERVICE_URL}/generate` with `X-Internal-Secret` header;
  parses `{text, model, usage}`; on `AxiosError` reads `{code, message}` from
  `error.response?.data` and throws `AiClientError(...)`. **Code allowlist** (so Python's
  `AI_NOT_CONFIGURED` survives the hop instead of being clobbered): if the body `code` is
  `AI_NOT_CONFIGURED` or `AI_GENERATION_FAILED`, passthrough that code + message;
  otherwise (401 secret mismatch, 5xx without a code, network/timeout) default to
  `AI_GENERATION_FAILED` with a generic leak-free message. Network/timeout errors
  (`ECONNABORTED`, no `error.response`) → `AI_GENERATION_FAILED`. Never rethrow raw
  axios errors. `configured()` = `AI_SERVICE_URL` **and** `INTERNAL_SECRET` are both set.
- **Modify** `apps/core-service/src/ai/ai.service.ts` — inject `AI_CLIENT` (was
  `AI_PROVIDER`); build the `AiGenerateRequest` context (already has `contentTypeName`,
  field, sibling values, history, tone, instruction) and call `client.generate(req)`
  instead of `buildMessages()`/`temperatureFor()`/the old provider. **Remove** the
  in-process `select` retry block — Python owns it now. Keep: field/Tier-1/`aiAssist`
  validation, `configured()` → `AI_NOT_CONFIGURED`, quota reserve (advisory lock +
  pending row + count vs limit), `finalize()` (succeeded/failed + token totals), and
  `remaining` computation. Map `AiClientError` → `rpcError(code, message)` (codes
  already match: `AI_NOT_CONFIGURED` / `AI_GENERATION_FAILED`).
- **Modify** `apps/core-service/src/ai/ai.module.ts` — wire
  `{ provide: AI_CLIENT, useClass: AiServiceClient }` (was `OpenAiCompatibleProvider`
  under `AI_PROVIDER`).
- **Delete** `apps/core-service/src/ai/ai-prompt.ts` (moved to `prompts.py`).
- **Delete** `apps/core-service/src/ai/ai-provider.interface.ts` (superseded by
  `ai-client.interface.ts`).
- **Delete** `apps/core-service/src/ai/providers/` (whole dir —
  `openai-compatible.provider.ts` moved to `generator.py`).
- **Modify** `apps/core-service/package.json` — remove `openai` from `dependencies`;
  add `axios`.
- **Modify** `apps/core-service/.env` + `.env.example` — remove `AI_API_KEY`,
  `AI_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_HEADERS`; activate `AI_SERVICE_URL`
  (default `http://localhost:8000`) + `INTERNAL_SECRET`.

### api-gateway
- No changes. `apps/api-gateway/src/content/ai.controller.ts` still forwards
  `{ workspaceId, projectId, userId, dto }` to `core.send(AI_PATTERNS.GENERATE)`. AI is
  still core-internal from the gateway's view. `AI_SERVICE_URL` / `INTERNAL_SECRET`
  never appear on the gateway.

### auth-service
- No changes.

## Frontend changes (apps/client)

No frontend changes. The client calls `POST /api/v1/content/ai/generate` with the same
`AiGenerateDto`; the response shape is identical. The Co-Writer panel, field quick
actions, and preview→apply flow are untouched.

## Files to create

- `apps/ai-service/main.py` (replace skeleton)
- `apps/ai-service/app/__init__.py`
- `apps/ai-service/app/config.py`
- `apps/ai-service/app/exceptions.py`
- `apps/ai-service/app/security.py`
- `apps/ai-service/app/schemas.py`
- `apps/ai-service/app/prompts.py`
- `apps/ai-service/app/llm.py`
- `apps/ai-service/app/generator.py`
- `apps/ai-service/app/routers/__init__.py`
- `apps/ai-service/app/routers/health.py`
- `apps/ai-service/app/routers/generate.py`
- `apps/ai-service/requirements.txt`
- `apps/core-service/src/ai/ai-client.interface.ts`
- `apps/core-service/src/ai/ai-service.client.ts`
- `specs/20-ai-service-extraction.md` (this file)

## Files to modify

- `apps/ai-service/main.py` (replace skeleton with app factory)
- `apps/ai-service/pyproject.toml` (add `openai` + `pydantic-settings`)
- `apps/ai-service/Dockerfile` (fix WORKDIR bug so `uvicorn main:app` resolves)
- `apps/ai-service/.env` + `.env/example` (AI_* + INTERNAL_SECRET + PORT; drop R2)
- `apps/core-service/src/ai/ai.service.ts` (HTTP client call; drop in-process prompt/select logic)
- `apps/core-service/src/ai/ai.module.ts` (wire `AI_CLIENT`)
- `apps/core-service/package.json` (drop `openai`; add `axios`)
- `apps/core-service/.env` + `.env.example` (drop AI_* provider vars; activate AI_SERVICE_URL + INTERNAL_SECRET)
- `render.yaml` (add `wriven-ai` pserv; add `AI_SERVICE_URL` + `INTERNAL_SECRET` to wriven-core)
- Docs (committed with the code):
  - `CLAUDE.md` (ai-service is now real, not deferred)
  - `doc/README.md`, `doc/overview.md`, `doc/architecture.md`, `doc/status.md`
  - `doc/core-service/core-service.md`, `doc/deployment.md`, `doc/market-readiness.md`
  - `doc/diagrams/00-system-overview.md`

## Files to delete

- `apps/core-service/src/ai/ai-prompt.ts`
- `apps/core-service/src/ai/ai-provider.interface.ts`
- `apps/core-service/src/ai/providers/openai-compatible.provider.ts`
- `apps/core-service/src/ai/providers/` (directory, once empty)

## New dependencies

- Python (ai-service `requirements.txt` + `pyproject.toml`): **`openai`** — the Python
  edition of the same Chat Completions SDK core used — and **`pydantic-settings`** —
  typed env config. (`fastapi`, `uvicorn[standard]`, `pydantic`, `python-dotenv` already
  present.) Keep `requirements.txt` and `pyproject.toml` in sync.
- npm: **`axios`** added to `apps/core-service` (the core→ai-service HTTP client).
  `openai` is **removed** from `apps/core-service` (LLM access moves to Python).
  Add `@types/axios` only if types aren't bundled (modern axios ships its own types —
  verify during implementation).

## Rules for implementation

Base:
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts`
  (`@wriven/contracts`) — check it before creating new ones. (None new here; the
  core→Python payload is a local interface + a mirrored Pydantic model, not a shared
  NestJS contract.)
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime. (N/A —
  ai-service touches no storage.)
- Respect microservice boundaries — ai-service owns **no tables** and makes **no DB
  connections**; all persistence (quota, audit, tokens) stays in core-service. The
  core→ai hop is the **only** NestJS↔non-NestJS HTTP call; all NestJS↔NestJS stays TCP.
- Endpoints return the response envelope; use error codes from
  `@wriven/contracts/errors.ts`; never leak stack traces, provider payloads, model
  errors, or DB errors. ai-service returns `{ code, message }` JSON on errors —
  `message` is a short, leak-free reason (port the existing `shortReason` discipline).
- Use dot-namespaced patterns from `@wriven/contracts/messages.ts`, never hardcoded
  strings. (`core.ai.generate` unchanged.)
- The gateway injects identity into TCP payloads; downstream services trust it. ai-service
  trusts core (no re-auth) — the `INTERNAL_SECRET` authenticates the transport, not the
  user.
- Frontend (`apps/client`) and backend changes go in **separate commits**;
  stage selectively, never `git add -A` across both. (No frontend change here, but the
  Python + core + render.yaml + docs land as separate logical commits.)
- Run NestJS tasks through `pnpm nx <target> <project>`. Commits are one-line
  Conventional Commits with no body. No AI/Claude co-author trailer.

Feature-specific:
- **Provider keys are ai-service-only.** `AI_API_KEY` moves to ai-service env. It never
  appears in gateway, core (after the move), or client env, and is never sent to the
  browser. core holds only `AI_SERVICE_URL` + `INTERNAL_SECRET`.
- **The quota invariant is preserved exactly.** Counting (`status IN ('pending',
  'succeeded')` in-period), the `pg_advisory_xact_lock(hashtext(workspace_id))` reserve,
  the `pending` row, and the `remaining` math all stay in core-service and are unchanged.
  A `failed` row still does **not** count (so a Python-side `select` miss or provider
  error charges no quota) — core finalizes `failed` on any non-2xx from ai-service.
- **Fail-closed if AI is unreachable, but never boot-fail.** Missing `AI_SERVICE_URL` →
  core's `configured()` returns false → `AI_NOT_CONFIGURED` (503); core still boots and
  all non-AI features keep working. ai-service down / timeout / network error →
  `AI_GENERATION_FAILED` (502) + a `failed` row. A non-2xx **with a known code in the
  body** (`AI_NOT_CONFIGURED`, `AI_GENERATION_FAILED`) passes that code through; anything
  else (401 secret mismatch, unmapped 5xx) → `AI_GENERATION_FAILED`. Python boot must not
  fail on a missing `AI_API_KEY` either — it returns `AI_NOT_CONFIGURED` (503) per call
  (port the "configured()" check), and core forwards that code.
- **Explicit HTTP timeout.** The core→ai-service axios call (`timeout: AI_TIMEOUT_MS`)
  and the Python `openai` client (`timeout=AI_TIMEOUT_MS`) both set an explicit timeout
  (~30s default). Never rely on default timeouts — a hung LLM call must not hang the TCP
  handler or the HTTP hop. axios throws `AxiosError` (code `ECONNABORTED` on timeout /
  `ERR_BAD_REQUEST` etc. on non-2xx) — map all axios errors to `AiClientError`, never
  rethrow raw.
- **Prompt parity.** `prompts.py` is a direct port of `ai-prompt.ts`. Same system-prompt
  rules, same per-operation templates, same `temperatureFor` map (0.3 for `select`/`rewrite`,
  0.7 otherwise), same `<entry_context>` injection-fence + "UNTRUSTED DATA" instruction,
  same richtext→semantic-HTML tag allowlist. Diverging prompts = silently different
  output; keep them in sync (treat `ai-prompt.ts` as the reference until deleted, then
  `prompts.py` is the source of truth).
- **Select validation/retry moves to Python.** Same rule: validate output ∈ `options`,
  retry once, raise on second miss → ai-service returns `502 AI_GENERATION_FAILED`;
  core marks the row `failed` (no quota charge). No `response_format`/tool-use on
  `openrouter/free`.
- **Auth the hop.** Every core→ai-service request carries `X-Internal-Secret:
  <INTERNAL_SECRET>`; ai-service rejects with 401 on mismatch. `INTERNAL_SECRET` is a
  secret — `sync: false` in `render.yaml`, never committed. In dev it lives in each
  service's gitignored `.env`.
- **No new shared contract.** `AiGenerateRequest` is defined in core-service (TS) and
  mirrored in ai-service (Pydantic). If they drift, Python's Pydantic validation
  surfaces it as a 422 → core maps to `AI_GENERATION_FAILED`. Keep the `operation` enum
  literals identical on both sides.
- **Render shape.** `wriven-ai` is a `pserv` (internal HTTP :8000), same as auth/core
  but HTTP not TCP — Render private services carry either. core reaches it at
  `AI_SERVICE_URL=http://wriven-ai:8000`. Add `INTERNAL_SECRET` to wriven-core and
  wriven-ai (per-service `sync: false`, not the shared group, so auth/gateway don't
  receive it).
- **Docs land with the code.** Every doc that says "in-process / deferred" flips to
  "extracted / real service" in the same PR. `doc/status.md` "Extract to Python
  ai-service" 🔲 → ✅; `doc/deployment.md` ai-service row → a real `pserv`. Code wins —
  update docs only once the move works.

## Definition of done

- [ ] `pnpm nx typecheck core-service api-gateway client` — clean.
- [ ] `pnpm nx lint core-service api-gateway client` — clean.
- [ ] `pnpm nx build core-service api-gateway client` — clean.
- [ ] `openai` removed from `apps/core-service/package.json`; no remaining import of
      `openai` in core-service (`grep -r "from 'openai'" apps/core-service/src` empty).
- [ ] ai-service starts locally: `cd apps/ai-service && uvicorn main:app --reload` →
      `GET /health` returns `{"status":"ok"}`.
- [ ] ai-service boots with `AI_API_KEY` unset (no crash); `POST /generate` returns
      `503 AI_NOT_CONFIGURED`.
- [ ] ai-service `POST /generate` with a valid `AI_API_KEY` + `X-Internal-Secret` + a
      `richtext` field + `operation:"generate"` returns `{ text, model, usage }` with
      non-zero `totalTokens`.
- [ ] ai-service rejects a missing/wrong `X-Internal-Secret` with `401`.
- [ ] End-to-end smoke (core + gateway + ai-service running, real `AI_API_KEY` on
      ai-service): `POST /api/v1/content/ai/generate` with
      `{ contentTypeId, fieldKey, operation:"generate" }` on a `richtext` field returns
      `{ text, model, usage, remaining }` in the success envelope — same response shape
      as before the move.
- [ ] Multi-turn: a second call with `history` (first user+assistant) +
      `instruction:"shorten"` returns a shorter refinement.
- [ ] `select` field: returned `text` ∈ `options[]`; the retry path is exercised (force
      a miss once). A double-miss → `AI_GENERATION_FAILED` (502), a `failed` row, and
      **no** quota charge (failed rows excluded from the count).
- [ ] Quota: with `aiTextRequestsPerMonth` artificially low, the (N+1)th call returns
      `{ success:false, error:{ code:"PLAN_LIMIT_REACHED", statusCode:403 } }` and **no**
      HTTP call to ai-service (reserve happens before the hop). Quota check remains
      atomic (`pending` row + `pg_advisory_xact_lock`).
- [ ] Burst throttle: > ~10 calls/min from one workspace → `RATE_LIMITED` (429)
      (unchanged — gateway-side).
- [ ] Unreachable: with `AI_SERVICE_URL` pointing at a dead port, the route returns
      `AI_GENERATION_FAILED` (502), a `failed` row is recorded, and no provider call is
      made; core still boots.
- [ ] Provider failure path: a bad `AI_MODEL` on ai-service → the endpoint returns
      `{ code:"AI_GENERATION_FAILED", statusCode:502 }`, no provider payload leaks, and
      a `failed` `ai_generations` row is recorded.
- [ ] `aiAssist:false` field → rejected `VALIDATION_ERROR`; a `number`/`date`/`boolean`/
      `media`/`reference` field key → rejected `VALIDATION_ERROR` (unchanged — core-side).
- [ ] `/usage` dashboard: `aiText.used` still reflects the in-period succeeded
      `ai_generations` count.
- [ ] `render.yaml` has `wriven-ai` pserv + `AI_SERVICE_URL` on wriven-core; secrets are
      `sync: false`.
- [ ] Docs updated: `doc/status.md` "Extract to Python ai-service" ✅; `doc/architecture.md`,
      `doc/overview.md`, `doc/deployment.md`, `doc/core-service/core-service.md`,
      `doc/diagrams/00-system-overview.md`, `doc/market-readiness.md`, `doc/README.md`,
      and `CLAUDE.md` all describe ai-service as a real service (no remaining
      "in-process / deferred" language about generation).
