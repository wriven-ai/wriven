import { Module } from '@nestjs/common';
import { CoreEntitlementsModule } from '../entitlements/core-entitlements.module';
import { AI_PROVIDER } from './ai-provider.interface';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';

/**
 * AI content generation. The provider is injected behind the `AiProvider` seam.
 * `OpenAiCompatibleProvider` talks Chat Completions and works with any
 * OpenAI-compatible endpoint (OpenRouter, OpenAI, Groq, …) — swapped via env, not
 * code. Extraction to a standalone `ai-service` later swaps this one file for an
 * HTTP client. DB (DRIZZLE) + ConfigService are globally available.
 */
@Module({
  imports: [CoreEntitlementsModule],
  controllers: [AiController],
  providers: [
    AiService,
    { provide: AI_PROVIDER, useClass: OpenAiCompatibleProvider },
  ],
})
export class AiModule {}
