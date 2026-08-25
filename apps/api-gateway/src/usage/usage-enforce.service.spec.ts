import { Logger } from '@nestjs/common';
import { ERROR_CODES } from '@wriven/contracts';
import { of, throwError } from 'rxjs';
import { UsageEnforceService } from './usage-enforce.service';
import { configStub } from '../testing/config-stub';

function usageView(used: number, limit: number | null) {
  return { requests: { used, limit } };
}

function makeService(
  map: Record<string, unknown> = {},
  sendResult: unknown = of(usageView(0, 1000)),
) {
  const send = jest.fn(() => sendResult);
  const core = { send } as never;
  const service = new UsageEnforceService(
    core,
    configStub({ USAGE_ENFORCE: 'true', USAGE_ENFORCE_TTL_MS: 30_000, ...map }),
  );
  return { service, send };
}

beforeAll(() => {
  Logger.overrideLogger([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('UsageEnforceService.assertRequests — the soft gate', () => {
  it('enforcement off (default) → allow without a core call', async () => {
    const send = jest.fn(() => of(usageView(999, 1)));
    const service = new UsageEnforceService(
      { send } as never,
      configStub({ USAGE_ENFORCE: 'false' }),
    );

    await expect(service.assertRequests('ws-1')).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('under the limit → allow', async () => {
    const { service } = makeService({}, of(usageView(41, 1000)));
    await expect(service.assertRequests('ws-1')).resolves.toBeUndefined();
  });

  it('null limit (unlimited) → allow', async () => {
    const { service } = makeService({}, of(usageView(999_999, null)));
    await expect(service.assertRequests('ws-1')).resolves.toBeUndefined();
  });

  it('at or over the limit → RATE_LIMITED', async () => {
    const { service } = makeService({}, of(usageView(1000, 1000)));
    await expect(service.assertRequests('ws-1')).rejects.toMatchObject({
      code: ERROR_CODES.RATE_LIMITED.code,
      message: expect.stringContaining('Monthly API request limit'),
    });
  });

  it('core lookup failure → fail OPEN (metering outage never blocks delivery)', async () => {
    const { service } = makeService({}, throwError(() => new Error('ECONNREFUSED')));
    await expect(service.assertRequests('ws-1')).resolves.toBeUndefined();
  });
});

describe('UsageEnforceService — read cache', () => {
  it('cached within the TTL — one core read serves repeated requests', async () => {
    const { service, send } = makeService();

    await service.assertRequests('ws-1');
    await service.assertRequests('ws-1');
    await service.assertRequests('ws-1');

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('cache expiry re-reads', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const { service, send } = makeService();

    await service.assertRequests('ws-1');
    jest.setSystemTime(new Date('2026-01-01T00:00:31.000Z'));
    await service.assertRequests('ws-1');

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('distinct workspaces read independently', async () => {
    const { service, send } = makeService();
    await service.assertRequests('ws-1');
    await service.assertRequests('ws-2');
    expect(send).toHaveBeenCalledTimes(2);
  });
});
