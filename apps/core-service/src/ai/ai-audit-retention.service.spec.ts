import { Logger } from '@nestjs/common';
import { AiAuditRetentionService } from './ai-audit-retention.service';
import type { AiService } from './ai.service';

beforeAll(() => {
  Logger.overrideLogger([]);
});

function makeService(redact: jest.Mock) {
  const ai = { redactExpiredAuditData: redact } as unknown as AiService;
  return { service: new AiAuditRetentionService(ai), redact };
}

describe('AiAuditRetentionService.redactExpiredAuditData (daily cron)', () => {
  it('delegates to AiService.redactExpiredAuditData', async () => {
    const redact = jest.fn().mockResolvedValue(7);
    const { service } = makeService(redact);

    await service.redactExpiredAuditData();

    expect(redact).toHaveBeenCalledTimes(1);
  });

  it('a redaction failure never crashes the scheduler (logged, swallowed)', async () => {
    const redact = jest.fn().mockRejectedValue(new Error('db down'));
    const { service } = makeService(redact);

    await expect(service.redactExpiredAuditData()).resolves.toBeUndefined();
  });
});
