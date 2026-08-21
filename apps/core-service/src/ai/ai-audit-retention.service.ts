import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiService } from './ai.service';

/** Daily redaction job — removes recoverable content, keeps operational metadata. */
@Injectable()
export class AiAuditRetentionService {
  private readonly logger = new Logger(AiAuditRetentionService.name);

  constructor(private readonly ai: AiService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async redactExpiredAuditData(): Promise<void> {
    try {
      const redacted = await this.ai.redactExpiredAuditData();
      if (redacted > 0) {
        this.logger.log(`Redacted recoverable data from ${redacted} AI audit row(s).`);
      }
    } catch (error) {
      this.logger.error(
        'Failed to redact expired AI audit data.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
