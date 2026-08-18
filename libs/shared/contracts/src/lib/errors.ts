/** Machine-readable error codes returned to the client (SCREAMING_SNAKE_CASE). */
export const ERROR_CODES = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', statusCode: 401 },
  FORBIDDEN: { code: 'FORBIDDEN', statusCode: 403 },
  NOT_FOUND: { code: 'NOT_FOUND', statusCode: 404 },
  CONFLICT: { code: 'CONFLICT', statusCode: 409 },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', statusCode: 422 },
  INVALID_CREDENTIALS: { code: 'INVALID_CREDENTIALS', statusCode: 401 },
  EMAIL_ALREADY_EXISTS: { code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 },
  INVALID_REFRESH_TOKEN: { code: 'INVALID_REFRESH_TOKEN', statusCode: 401 },
  INVALID_RESET_TOKEN: { code: 'INVALID_RESET_TOKEN', statusCode: 400 },
  INVALID_VERIFICATION_TOKEN: {
    code: 'INVALID_VERIFICATION_TOKEN',
    statusCode: 400,
  },
  INVALID_VERIFICATION_CODE: {
    code: 'INVALID_VERIFICATION_CODE',
    statusCode: 400,
  },
  OAUTH_FAILED: { code: 'OAUTH_FAILED', statusCode: 400 },
  RATE_LIMITED: { code: 'RATE_LIMITED', statusCode: 429 },
  PLAN_LIMIT_REACHED: { code: 'PLAN_LIMIT_REACHED', statusCode: 403 },
  STRIPE_WEBHOOK_INVALID: { code: 'STRIPE_WEBHOOK_INVALID', statusCode: 400 },
  // Workspace already has a live Stripe subscription — use the Billing Portal to
  // change plans (proration) instead of starting a second Checkout subscription.
  SUBSCRIPTION_EXISTS: { code: 'SUBSCRIPTION_EXISTS', statusCode: 409 },
  // No live paid subscription to change — call createCheckout to subscribe first.
  SUBSCRIPTION_NOT_FOUND: { code: 'SUBSCRIPTION_NOT_FOUND', statusCode: 404 },
  // A downgrade is blocked: the workspace holds more of a stock resource
  // (projects, members, content types, entries, API keys, webhooks, storage)
  // than the target plan allows. `details` lists each over-limit dimension.
  // The user must trim below the target limits before downgrading.
  DOWNGRADE_BLOCKED: { code: 'DOWNGRADE_BLOCKED', statusCode: 409 },
  // A Stripe call failed mid plan create/retire sync — DB write skipped so the
  // plan row isn't left half-linked. Retryable.
  STRIPE_SYNC_FAILED: { code: 'STRIPE_SYNC_FAILED', statusCode: 500 },
  // The LLM provider call failed (upstream error, timeout, bad response, upstream
  // rate limit, or a `select` retry-miss).
  AI_GENERATION_FAILED: { code: 'AI_GENERATION_FAILED', statusCode: 502 },
  // AI is not configured (AI_API_KEY missing). Returned on the route, not a boot
  // failure — core-service stays up.
  AI_NOT_CONFIGURED: { code: 'AI_NOT_CONFIGURED', statusCode: 503 },
  // AI usage is a paid resource: do not submit a provider request when the
  // workspace allowance cannot be verified.
  AI_QUOTA_UNAVAILABLE: { code: 'AI_QUOTA_UNAVAILABLE', statusCode: 503 },
  // Aggregate user-controlled input (draft + history + context) exceeds the
  // context budget. Actionable, unlike the generic failure it used to collapse
  // into — the author can shorten the draft or clear the conversation.
  AI_INPUT_TOO_LARGE: { code: 'AI_INPUT_TOO_LARGE', statusCode: 422 },
  // The same idempotency key is already executing. Reuse the key only for a
  // safe retry of the same request; start a new generation with a new key.
  AI_GENERATION_IN_PROGRESS: { code: 'AI_GENERATION_IN_PROGRESS', statusCode: 409 },
  // A client accidentally attached one idempotency key to two different inputs.
  IDEMPOTENCY_KEY_REUSED: { code: 'IDEMPOTENCY_KEY_REUSED', statusCode: 409 },
  // The idempotency key's stored result was redacted by retention. The replay
  // window is over — start a new generation with a new key. Distinct from a
  // failure: never report a succeeded-but-expired request as an error state.
  AI_RESULT_EXPIRED: { code: 'AI_RESULT_EXPIRED', statusCode: 410 },
  // A gateway-routed backend call exceeded its deadline (no response from the
  // downstream service). 504, not 502: the request never completed.
  GATEWAY_TIMEOUT: { code: 'GATEWAY_TIMEOUT', statusCode: 504 },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', statusCode: 500 },
} as const;

export type ErrorCodeKey = keyof typeof ERROR_CODES;
