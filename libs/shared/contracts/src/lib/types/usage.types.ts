/**
 * Usage metering — current-period consumption for a workspace. Backed by
 * `core_svc.usage_buckets` (Delivery API request counter) + a live
 * `media_assets.size_bytes` SUM (storage). Limits come from the workspace's
 * effective plan (`auth.entitlements.resolve`).
 *
 * v1 meters Delivery API requests at the gateway (one increment per HTTP
 * request authenticated by a `Bearer wrk_…` key). Storage is the current sum;
 * `assetBandwidthGb` is intentionally NOT measured yet (media is R2 keys-only,
 * so the gateway never serves asset bytes — real egress lives in R2) — its
 * limit field stays in `PlanLimits` for future use.
 */

/** A billing window. v1 = calendar month, UTC midnight boundaries. */
export interface UsagePeriod {
  start: string; // ISO
  end: string; // ISO
}

/**
 * Current-period usage vs plan limits for a workspace. `limit: null` = the
 * plan dimension is unlimited. `requests.used` is the count of Delivery API
 * requests this period; `storage.usedMb` is the live media sum.
 */
export interface UsageView {
  period: UsagePeriod;
  requests: { used: number; limit: number | null };
  storage: { usedMb: number; limitMb: number | null };
  ai: AiUsageStats;
}

/**
 * AI generation usage for the current period.
 *
 * Note the deliberate status split, which must not be "simplified":
 * - `requests.used` counts **succeeded** generations only — the billed unit.
 * - `tokens` and `cost` sum **succeeded + failed** — a failed provider call
 *   still burns tokens, so its spend is real and reported.
 *
 * `cost.complete` is false when at least one in-period generation used a model
 * with no known price (`unpricedGenerations > 0`); the UI then hides or flags
 * the dollar figure rather than showing a confidently-wrong number. `microusd`
 * is the sum of the *known* costs regardless.
 */
export interface AiUsageStats {
  requests: { used: number; limit: number | null };
  tokens: { prompt: number; completion: number; total: number };
  cost: { microusd: number; complete: boolean; unpricedGenerations: number };
}

/**
 * Batched increment payload sent gateway → core (`core.usage.record`). Each
 * bucket is atomically added (`ON CONFLICT … + request_count`). `periodStart`
 * is tagged at bump-time so a flush straddling a month boundary attributes
 * counts to the correct period.
 */
export interface UsageBucket {
  workspaceId: string;
  periodStart: string; // ISO — matches usage_buckets.period_start
  periodEnd: string; // ISO
  requestCount: number;
}
