import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreEntitlementsModule } from '../entitlements/core-entitlements.module';
import { AI_CLIENT } from './ai-client.interface';
import { AiAuditRetentionService } from './ai-audit-retention.service';
import { AiController } from './ai.controller';
import { AiProfileService } from './ai-profile.service';
import { AiService } from './ai.service';
import { AiServiceClient } from './ai-service.client';

/**
 * AI content generation. The LLM client is injected behind the `AiClient` seam;
 * `AiServiceClient` is an HTTP client to the standalone Python `ai-service`
 * (`${AI_SERVICE_URL}/generate`). Prompt building, temperature, and `select`
 * validation/retry live in Python — core only assembles context + meters usage.
 * `AiProfileService` owns the per-project brand voice / glossary / language
 * (read on every generation). DB (DRIZZLE) + ConfigService are global.
 */
@Module({
  imports: [ScheduleModule.forRoot(), CoreEntitlementsModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiProfileService,
    AiAuditRetentionService,
    { provide: AI_CLIENT, useClass: AiServiceClient },
  ],
})
export class AiModule {}
