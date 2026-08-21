/**
 * Usage metering — current-period consumption for a workspace. Backed by
 * `core_svc.usage_buckets` (Delivery API requests) + a live
 * `media_assets.size_bytes` SUM (storage); limits come from the effective plan
 * (`auth.entitlements.resolve`). `assetBandwidthGb` is intentionally unmetered:
 * media is R2 keys-only, so the gateway never serves asset bytes — real egress
 * lives in R2. The limit field stays in `PlanLimits` for future use.
 */

/** A billing window. v1 = calendar month, UTC midnight boundaries. */
export interface UsagePeriod {
  start: string; // ISO
  end: string; // ISO
}

/**
 * Current-period usage vs plan limits. `limit: null` = unlimited on that
 * dimension; `requests.used` counts Delivery API requests, `storage.usedMb`
 * is the live media sum.
 */
export interface UsageView {
  period: UsagePeriod;
  requests: { used: number; limit: number | null };
  storage: { usedMb: number; limitMb: number | null };
  ai: AiUsageStats;
}

/**
 * AI usage for the current period. Deliberate status split — do not
 * "simplify": `requests.used` counts succeeded generations only (the billed
 * unit), while `tokens` and `cost` sum succeeded + failed (a failed provider
 * call still burns tokens). `cost.complete` is false when any in-period
 * generation had no known price; `microusd` sums the known costs regardless.
 */
export interface AiUsageStats {
  requests: { used: number; limit: number | null };
  tokens: { prompt: number; completion: number; total: number };
  cost: { microusd: number; complete: boolean; unpricedGenerations: number };
}

/**
 * Batched increment payload (gateway → core, `core.usage.record`). Buckets are
 * added atomically (`ON CONFLICT … + request_count`); `periodStart` is tagged
 * at bump-time so a flush straddling a month boundary attributes counts
 * correctly.
 */
export interface UsageBucket {
  workspaceId: string;
  periodStart: string; // ISO — matches usage_buckets.period_start
  periodEnd: string; // ISO
  requestCount: number;
}
