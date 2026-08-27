import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { ContentTypesService } from '../content/content-types.service';
import { EntriesService } from '../content/entries.service';
import { DeliveryService } from '../delivery/delivery.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AiService } from '../ai/ai.service';
import { UsageService } from '../usage/usage.service';

// The drizzle provider requires DATABASE_URL at construct time; the
// postgres.js client is lazy — no connection is opened during compile.
process.env.DATABASE_URL ??= 'postgresql://smoke:smoke@127.0.0.1:5432/smoke';

/**
 * Bootstrap smoke: prove the real AppModule wires — every feature module's
 * provider graph (content, delivery, webhooks, AI, usage, support) resolves
 * together with the shared DB provider. Unit specs build service graphs by
 * hand; only this spec catches a broken provider token or missing export.
 */
describe('AppModule — bootstrap smoke', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('compiles the full DI graph', () => {
    expect(moduleRef).toBeDefined();
  });

  it('constructs the feature services against the real module graph', () => {
    expect(moduleRef.get(ContentTypesService, { strict: false })).toBeInstanceOf(
      ContentTypesService,
    );
    expect(moduleRef.get(EntriesService, { strict: false })).toBeInstanceOf(EntriesService);
    expect(moduleRef.get(DeliveryService, { strict: false })).toBeInstanceOf(DeliveryService);
    expect(moduleRef.get(WebhooksService, { strict: false })).toBeInstanceOf(WebhooksService);
    expect(moduleRef.get(AiService, { strict: false })).toBeInstanceOf(AiService);
    expect(moduleRef.get(UsageService, { strict: false })).toBeInstanceOf(UsageService);
  });
});
