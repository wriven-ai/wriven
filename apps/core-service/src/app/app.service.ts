import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';

/** The gateway's /v1/health awaits this ping inside Render's 5s health-check
 * budget, so the DB round-trip must fail fast rather than hang — a stalled
 * `select 1` once got the (healthy) gateway killed on a downstream blip. */
const PING_TIMEOUT_MS = 1_500;

/** Watchdog cadence and trip point: ~5 min of continuously failing probes. */
const WATCHDOG_INTERVAL_MS = 30_000;
const WEDGE_FAILURE_LIMIT = 10;

@Injectable()
export class AppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppService.name);
  private watchdogTimer?: ReturnType<typeof setInterval>;
  private consecutiveFailures = 0;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>) {}

  /** Keep probing the pool even with zero external traffic — Render's health
   * check only watches the gateway, and /v1/health deliberately stays 200 on
   * downstream blips, so nothing else notices a wedged core. */
  onModuleInit(): void {
    this.watchdogTimer = setInterval(
      () => void this.watchdogTick(),
      WATCHDOG_INTERVAL_MS,
    );
    this.watchdogTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.watchdogTimer);
  }

  async ping() {
    await this.probeDb();
    return {
      service: 'core-service',
      db: 'up',
      ts: new Date().toISOString(),
    };
  }

  /** `select 1` raced against a deadline. The race reports failure fast but
   * cannot cancel the query — postgres.js has no per-query abort — so a
   * wedged pool keeps parking probes. The watchdog is what recovers from
   * that state. */
  private async probeDb(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.db.execute(sql`select 1`),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('db ping timeout')),
            PING_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The pool can wedge in a state no pool option reaps: when the Supabase
   * pooler drops a connection mid-query without a FIN, postgres.js counts it
   * busy forever (idle_timeout/max_lifetime only close connections between
   * queries), the pool stays full of zombies, and every new query parks in
   * the queue until the heap dies — 2026-09-22: core-service OOM'd ~4.5 days
   * into exactly this state. Exiting is the only reaper: Render restarts the
   * pserv with a fresh pool and traffic recovers in about a minute. The
   * limit tolerates transient blips; only sustained failure trips it. */
  private async watchdogTick(): Promise<void> {
    try {
      await this.probeDb();
      if (this.consecutiveFailures > 0) {
        this.logger.warn('db probe recovered — pool healthy again');
      }
      this.consecutiveFailures = 0;
      return;
    } catch (err) {
      this.consecutiveFailures += 1;
      this.logger.warn(
        `db probe failed ${this.consecutiveFailures}/${WEDGE_FAILURE_LIMIT}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    if (this.consecutiveFailures >= WEDGE_FAILURE_LIMIT) {
      this.logger.fatal(
        `db pool unresponsive for ${WEDGE_FAILURE_LIMIT} consecutive probes — exiting so Render restarts with a fresh pool`,
      );
      process.exit(1);
    }
  }
}
