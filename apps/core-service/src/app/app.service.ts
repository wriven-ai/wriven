import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';

/** The gateway's /v1/health awaits this ping inside Render's 5s health-check
 * budget, so the DB round-trip must fail fast rather than hang — a stalled
 * `select 1` once got the (healthy) gateway killed on a downstream blip. */
const PING_TIMEOUT_MS = 1_500;

@Injectable()
export class AppService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>) {}

  async ping() {
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
    return {
      service: 'core-service',
      db: 'up',
      ts: new Date().toISOString(),
    };
  }
}
