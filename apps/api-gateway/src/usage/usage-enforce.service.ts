import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import {
  ERROR_CODES,
  SERVICE_TOKENS,
  USAGE_PATTERNS,
} from '@wriven/contracts';
import { firstValueFrom, timeout } from 'rxjs';
import type { UsageView } from '@wriven/contracts';

const RESOLVE_TIMEOUT_MS = 2000;

interface CacheEntry {
  used: number;
  limit: number | null;
  expires: number;
}

/**
 * Soft overage gate for the monthly Delivery API request quota. When
 * `USAGE_ENFORCE=true`, checks the workspace's current-period usage (cached
 * briefly) against `apiRequestsPerMonth`; at/over the limit it rejects with
 * `RATE_LIMITED`. **Fails open**: if enforcement is off, or the usage lookup
 * fails / is uncached, the request is allowed — metering must never break
 * delivery (same contract as `CoreEntitlementsService`). The check is
 * intentionally eventual: the counter is batched, so the gate lags real usage
 * by one flush. See specs/14.
 */
@Injectable()
export class UsageEnforceService {
  private readonly logger = new Logger(UsageEnforceService.name);
  private readonly enabled: boolean;
  private readonly ttlMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
    private readonly cfg: ConfigService,
  ) {
    this.enabled = this.cfg.get<string>('USAGE_ENFORCE', 'false') === 'true';
    this.ttlMs = this.cfg.get<number>('USAGE_ENFORCE_TTL_MS', 30_000);
  }

  async assertRequests(workspaceId: string): Promise<void> {
    if (!this.enabled) return;

    const now = Date.now();
    const hit = this.cache.get(workspaceId);
    let used: number | undefined;
    let limit: number | null | undefined;

    if (hit && hit.expires > now) {
      used = hit.used;
      limit = hit.limit;
    } else {
      try {
        const view = await firstValueFrom(
          this.core
            .send<UsageView>(USAGE_PATTERNS.READ, { workspaceId })
            .pipe(timeout(RESOLVE_TIMEOUT_MS)),
        );
        used = view.requests.used;
        limit = view.requests.limit;
        this.cache.set(workspaceId, {
          used,
          limit,
          expires: now + this.ttlMs,
        });
      } catch (err) {
        // Fail open — a metering outage must not block delivery.
        this.logger.warn(
          `usage read failed for ${workspaceId}; allowing (fail-open): ${String(err)}`,
        );
        return;
      }
    }

    if (limit != null && used >= limit) {
      throw {
        ...ERROR_CODES.RATE_LIMITED,
        message: 'Monthly API request limit reached for your plan.',
      };
    }
  }
}
