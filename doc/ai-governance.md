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

Provider data-region selection is a deployment-level provider configuration.
Before adding a region-specific or regulated-customer offering, introduce a
workspace policy that constrains providers and regions; Sensitive fields and
context allowlists are the enforced controls today.

## Billing and retries

- One browser UUID is one idempotent generation intent. A transport timeout or
  "stop waiting" can safely reuse it; a completed result is replayed without a
  second provider call.
- A failed provider call does **not** consume the customer's monthly *request*
  allowance. Its provider-reported token usage is retained on the failed audit
  row, so Wriven can measure the actual cost. A manual retry starts a new intent
  and may be billable if it succeeds.
- Set both Core model-price settings (`AI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS`
  and `AI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS`) to record a cost estimate in
  each audit row. They are deliberately null when the provider price is unknown;
  Wriven must not guess a model's commercial rate.
- The synchronous text path has provider retries disabled. Only a constrained
  `select` correction makes a second provider call, and both attempts’ tokens
  are aggregated.

## Monitoring

Scrape ai-service’s private `/metrics` endpoint and alert on provider failures,
throttles, latency, token growth, and (when queues are introduced) queue depth
and dead-letter volume. Core’s `ai_generations` is the source for per-workspace
usage, token, latency, and cost reconciliation.
