import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreEntitlementsModule } from '../entitlements/core-entitlements.module';
import { AI_CLIENT } from './ai-client.interface';
import { AiAuditRetentionService } from './ai-audit-retention.service';
import { AiController } from './ai.controller';
import { AiProfileService } from './ai-profile.service';
import { AiService } from './ai.service';
import { AiServiceClient } from './ai-service.client';

/** AI generation. The LLM client sits behind the AiClient seam; prompts live in Python. */
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
