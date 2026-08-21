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
  // Downgrade blocked: the workspace holds more of a stock resource than the
  // target plan allows. `details` lists each over-limit dimension.
  DOWNGRADE_BLOCKED: { code: 'DOWNGRADE_BLOCKED', statusCode: 409 },
  // A Stripe call failed mid plan create/retire sync — DB write skipped so the
  // plan row isn't left half-linked. Retryable.
  STRIPE_SYNC_FAILED: { code: 'STRIPE_SYNC_FAILED', statusCode: 500 },
  // The LLM provider call failed (upstream error, timeout, bad response, rate
  // limit, or a `select` retry-miss).
  AI_GENERATION_FAILED: { code: 'AI_GENERATION_FAILED', statusCode: 502 },
  // AI_API_KEY missing. Returned on the route, not a boot failure.
  AI_NOT_CONFIGURED: { code: 'AI_NOT_CONFIGURED', statusCode: 503 },
  // AI usage is paid — never submit a provider request when the allowance
  // can't be verified.
  AI_QUOTA_UNAVAILABLE: { code: 'AI_QUOTA_UNAVAILABLE', statusCode: 503 },
  // User-controlled input (draft + history + context) exceeds the context
  // budget — the author can shorten the draft or clear the conversation.
  AI_INPUT_TOO_LARGE: { code: 'AI_INPUT_TOO_LARGE', statusCode: 422 },
  // Same idempotency key already executing. Retry the same request, or start
  // a new generation with a new key.
  AI_GENERATION_IN_PROGRESS: { code: 'AI_GENERATION_IN_PROGRESS', statusCode: 409 },
  // A client accidentally attached one idempotency key to two different inputs.
  IDEMPOTENCY_KEY_REUSED: { code: 'IDEMPOTENCY_KEY_REUSED', statusCode: 409 },
  // Stored result redacted by retention — replay window over, start a new
  // generation. Never report a succeeded-but-expired request as an error state.
  AI_RESULT_EXPIRED: { code: 'AI_RESULT_EXPIRED', statusCode: 410 },
  // A backend call exceeded its deadline. 504, not 502 — the request never
  // completed.
  GATEWAY_TIMEOUT: { code: 'GATEWAY_TIMEOUT', statusCode: 504 },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', statusCode: 500 },
} as const;

export type ErrorCodeKey = keyof typeof ERROR_CODES;
