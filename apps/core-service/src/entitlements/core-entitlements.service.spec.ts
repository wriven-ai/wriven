import { Logger } from '@nestjs/common';
import { AUTH_PATTERNS } from '@wriven/contracts';
import { of, throwError } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { CoreEntitlementsService } from './core-entitlements.service';
import { asDb, createDbMock } from '../testing/drizzle-mock';

beforeAll(() => {
  Logger.overrideLogger([]);
});

function makeService() {
  const db = createDbMock();
  const send = jest.fn();
  const auth = { send } as unknown as ClientProxy;
  const service = new CoreEntitlementsService(asDb(db), auth);
  return { service, db, send };
}

const LIMITS = { entries: 10, apiKeys: 3, webhooks: 2, storageMb: 100 };

function resolveWith(limits: unknown) {
  return of({ planKey: 'pro', limits, usage: { projects: 1, members: 1 } });
}

describe('CoreEntitlementsService — limits resolution + caching', () => {
  it('resolves via auth-service ENTITLEMENTS_RESOLVE and caches for 30s', async () => {
    const { service, send } = makeService();
    send.mockReturnValue(resolveWith(LIMITS));

    const first = await service.effectiveLimits('ws-1');
    const second = await service.effectiveLimits('ws-1'); // cache hit

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      AUTH_PATTERNS.ENTITLEMENTS_RESOLVE,
      { workspaceId: 'ws-1' },
    );
    expect(first).toEqual(LIMITS);
    expect(second).toEqual(LIMITS);
  });

  it('cache expiry re-fetches', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { service, send } = makeService();
    send.mockReturnValue(resolveWith(LIMITS));

    await service.effectiveLimits('ws-1');
    jest.setSystemTime(new Date('2026-01-01T00:00:31Z')); // past the 30s TTL
    await service.effectiveLimits('ws-1');

    expect(send).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('auth unreachable, no cache → null (fail-open for CMS writes)', async () => {
    const { service, send } = makeService();
    send.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

    expect(await service.effectiveLimits('ws-1')).toBeNull();
  });

  it('auth unreachable WITH a stale cache → stale limits served', async () => {
    const { service, send } = makeService();
    send
      .mockReturnValueOnce(resolveWith(LIMITS))
      .mockReturnValueOnce(throwError(() => new Error('down')));

    await service.effectiveLimits('ws-1'); // prime
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T01:00:00Z'));
    const stale = await service.effectiveLimits('ws-1'); // fetch fails
    jest.useRealTimers();

    expect(stale).toEqual(LIMITS);
  });
});

describe('CoreEntitlementsService — quota asserts', () => {
  it('null/absent limit → skip enforcement (no count query)', async () => {
    const { service, db, send } = makeService();
    send.mockReturnValue(resolveWith({}));

    await service.assertEntryQuota('ws-1');
    expect(db.$count).not.toHaveBeenCalled();
  });

  it('at or over the limit → PLAN_LIMIT_REACHED', async () => {
    const { service, db, send } = makeService();
    send.mockReturnValue(resolveWith({ entries: 10 }));
    db.$count.mockResolvedValue(10);

    try {
      await service.assertEntryQuota('ws-1');
      throw new Error('expected rejection');
    } catch (e) {
      const payload = (e as { getError: () => { code: string; message: string } }).getError();
      expect(payload.code).toBe('PLAN_LIMIT_REACHED');
      expect(payload.message).toContain('allows 10 entries');
    }
  });

  it('under the limit → passes', async () => {
    const { service, db, send } = makeService();
    send.mockReturnValue(resolveWith({ entries: 10 }));
    db.$count.mockResolvedValue(9);

    await expect(service.assertEntryQuota('ws-1')).resolves.toBeUndefined();
  });
});

describe('CoreEntitlementsService — derived limits', () => {
  it('storageLimitBytes converts MB to bytes; null when unlimited', async () => {
    const { service, send } = makeService();
    send
      .mockReturnValueOnce(resolveWith({ storageMb: 100 }))
      .mockReturnValueOnce(resolveWith({}));

    // Distinct workspaces: results are cached 30s per workspace.
    expect(await service.storageLimitBytes('ws-1')).toBe(100 * 1024 * 1024);
    expect(await service.storageLimitBytes('ws-2')).toBeNull();
  });

  it('aiTextLimit FAILS CLOSED when limits are unresolvable', async () => {
    const { service, send } = makeService();
    send.mockReturnValue(throwError(() => new Error('down')));

    try {
      await service.aiTextLimit('ws-1');
      throw new Error('expected rejection');
    } catch (e) {
      const payload = (e as { getError: () => { code: string } }).getError();
      expect(payload.code).toBe('AI_QUOTA_UNAVAILABLE');
    }
  });

  it('aiTextLimit: null limit = unlimited; a value passes through', async () => {
    const { service, send } = makeService();
    send
      .mockReturnValueOnce(resolveWith({}))
      .mockReturnValueOnce(resolveWith({ aiTextRequestsPerMonth: 250 }));

    expect(await service.aiTextLimit('ws-1')).toBeNull();
    expect(await service.aiTextLimit('ws-2')).toBe(250);
  });

  it('revisionsCap passes through or null', async () => {
    const { service, send } = makeService();
    send
      .mockReturnValueOnce(resolveWith({ revisionsPerEntry: 20 }))
      .mockReturnValueOnce(resolveWith({}));

    expect(await service.revisionsCap('ws-1')).toBe(20);
    expect(await service.revisionsCap('ws-2')).toBeNull();
  });
});
