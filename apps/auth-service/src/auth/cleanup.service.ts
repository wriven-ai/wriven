import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import { lt } from 'drizzle-orm';
import * as schema from '../db/schema';

const {
  refreshTokens,
  passwordResetTokens,
  emailVerificationTokens,
  workspaceActivityLog,
} = schema;

/** Prunes expired token rows so the auth tables don't grow unbounded. */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>) {}

  // Daily. Only deletes *expired* rows — revoked-but-unexpired refresh tokens
  // are kept so reuse can still be detected as theft within their TTL.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneExpiredTokens(): Promise<void> {
    const now = new Date();
    const refresh = await this.db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, now))
      .returning({ id: refreshTokens.id });
    const resets = await this.db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, now))
      .returning({ id: passwordResetTokens.id });
    const verifications = await this.db
      .delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, now))
      .returning({ id: emailVerificationTokens.id });

    this.logger.log(
      `Pruned ${refresh.length} refresh + ${resets.length} reset + ${verifications.length} verification token(s).`,
    );
  }

  // Daily. The activity feed only ever shows the last 90 days, so older rows
  // are pure storage cost. Idempotent DELETE — safe to re-run.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneActivityLogs(): Promise<void> {
    const days = Number(process.env.WORKSPACE_LOG_RETENTION_DAYS ?? 90);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const pruned = await this.db
      .delete(workspaceActivityLog)
      .where(lt(workspaceActivityLog.createdAt, cutoff))
      .returning({ id: workspaceActivityLog.id });
    this.logger.log(`Pruned ${pruned.length} workspace activity log row(s).`);
  }
}
