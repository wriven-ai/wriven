import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';

@Injectable()
export class AppService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>) {}

  async ping() {
    await this.db.execute(sql`select 1`);
    return {
      service: 'core-service',
      db: 'up',
      ts: new Date().toISOString(),
    };
  }
}
