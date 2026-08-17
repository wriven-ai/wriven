# AI governance and operating policy

Wriven’s text AI is an assisted-authoring feature. A generation is a draft until
an author explicitly applies it and saves the entry; it never publishes content.
AI is enabled for every workspace; access is controlled by the project-level
`AI_GENERATE` permission, not a workspace consent switch.

## Privacy and data handling

- A field marked **Sensitive** is never eligible as an AI target or context.
- Context is opt-in per target field: only its `aiContextFields` allowlist may
  leave the CMS. Sibling fields are untrusted data in the model prompt.
- Prompts and sibling context are not persisted. `ai_generations` retains the
  result temporarily for idempotent recovery and author comparison, then core
  redacts `output` and `request_hash` after `AI_AUDIT_RETENTION_DAYS` (30 days
  by default). A Core daily job enforces this even when that workspace does not
  generate again. Operational metadata remains for financial and incident audit.
- The ai-service logs correlation, route, outcome, and latency only—never CMS
  content, prompts, provider keys, or raw provider error bodies.
- The per-project AI voice profile (brand voice, glossary, language) is
  operator-authored configuration, not CMS content. It is injected into the system
  prompt as a fenced `<voice_guide>` block, never sent by the client on the generate
  call (core resolves it server-side). It is stored in `core_svc.ai_profiles`.

Provider data-region selection is a deployment-level provider configuration.
Before adding a region-specific or regulated-customer offering, introduce a
workspace policy that constrains providers and regions; Sensitive fields and
context allowlists are the enforced controls today.

## Cost and pricing

- Cost is computed from the **returned** model (`response.model`), not the requested
  one: `openrouter/free` resolves to a different model per call, so a single global
  price would be wrong. Resolution order in `core/ai/ai-model-prices.ts`: exact model
  → longest suffix rule (`…:free` is genuinely $0) → env default pair → `null`.
- `0` ≠ `null`. A free model is priced `0` (a fact, recorded); an unknown model is
  `null` (never guessed). A period containing any `null`-priced generation reports
  `cost.complete = false` with `unpricedGenerations > 0` — the UI hides the dollar
  figure rather than show a confidently-wrong number.
- `ai_generations.cost_microusd` is set on **both** succeeded and failed rows (a failed
  provider call still burns tokens). The `/usage` aggregate sums tokens and cost over
  `succeeded + failed`, but the billable **request** count is `succeeded` only.
- The two Core env settings (`AI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS` /
  `AI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS`) are now a **fallback** behind the model
  price map — set them only when `AI_MODEL` points at a single known-priced model.

## Billing and retries

- One browser UUID is one idempotent generation intent. A transport timeout or
  "stop waiting" can safely reuse it; a completed result is replayed without a
  second provider call. For a whole-entry `compose`, one intent is **one** generation
  (one quota unit) regardless of how many fields it fills.
- A failed provider call does **not** consume the customer's monthly *request*
  allowance. Its provider-reported token usage is retained on the failed audit
  row, so Wriven can measure the actual cost. The row also persists the contract
  error **code** (`ai_generations.error_code`, specs/22), so re-sending a failed
  key rethrows the original status class instead of a generic 502. A manual
  retry starts a new intent and may be billable if it succeeds.
- Replaying a **succeeded** key after retention redacted its stored output
  returns `AI_RESULT_EXPIRED` (410) — the client starts a new generation. A
  success is never reported as a failure.
- The synchronous text path has provider retries disabled. Only three
  constrained second calls exist — a `select` option correction, a `compose`
  JSON repair, and a free-text guardrail correction — and every attempt's
  tokens are aggregated, including when the second call itself fails
  transport-side.

## Monitoring

Scrape ai-service's private `/metrics` endpoint and alert on provider failures,
throttles, latency, token growth, and (when queues are introduced) queue depth
and dead-letter volume. Core's `ai_generations` is the source for per-workspace
usage, token, latency, and cost reconciliation; `applied_field_keys` records which
fields a `compose` draft filled (the full generated set — the exact applied subset
isn't sent on save).
