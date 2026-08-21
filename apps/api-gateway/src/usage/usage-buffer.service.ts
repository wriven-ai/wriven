import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_TOKENS, USAGE_PATTERNS, UsageBucket } from '@wriven/contracts';

/**
 * In-process delivery counter: `bump()` off the hot path (a Map increment), a
 * `setInterval` flush drains batches to core.usage.record. No persistence —
 * in-flight counts lost on crash, acceptable for soft metering.
 * `periodStart` is tagged at bump-time so a month-boundary flush attributes
 * correctly.
 */
@Injectable()
export class UsageBufferService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(UsageBufferService.name);
  private readonly buffer = new Map<string, UsageBucket>();
  private readonly flushIntervalMs: number;
  private readonly threshold: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
    private readonly cfg: ConfigService,
  ) {
    this.flushIntervalMs = this.cfg.get<number>('USAGE_FLUSH_INTERVAL_MS', 15_000);
    this.threshold = this.cfg.get<number>('USAGE_FLUSH_THRESHOLD', 100);
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    void this.flush(); // best-effort final drain
  }

  /** One Delivery API request for this workspace in the current period. */
  bump(workspaceId: string): void {
    const period = currentPeriod();
    const key = `${workspaceId}|${period.start.toISOString()}`;
    const existing = this.buffer.get(key);
    if (existing) {
      existing.requestCount += 1;
    } else {
      this.buffer.set(key, {
        workspaceId,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        requestCount: 1,
      });
    }
    if (this.buffer.size >= this.threshold) void this.flush();
  }

  /** Drain the buffer to core-service (fire-and-forget). */
  async flush(): Promise<void> {
    if (this.buffer.size === 0) return;
    const buckets = [...this.buffer.values()];
    this.buffer.clear();
    // emit = no ack; soft metering tolerates a dropped flush.
    this.core.emit(USAGE_PATTERNS.RECORD, { buckets });
    this.logger.debug(`flushed ${buckets.length} usage bucket(s) to core-service`);
  }
}

/** Current billing window: calendar month, UTC midnight boundaries. */
function currentPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
