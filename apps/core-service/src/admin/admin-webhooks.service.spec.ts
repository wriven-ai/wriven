import { RpcException } from '@nestjs/microservices';
import { AdminWebhooksService } from './admin-webhooks.service';
import {
  writeChain,
  asDb,
  chainOf,
  createDbMock,
  serializeFragment,
} from '../testing/drizzle-mock';

const T0 = new Date('2026-01-15T10:00:00.000Z');
const T1 = new Date('2026-02-20T08:30:00.000Z');

function makeService() {
  const db = createDbMock();
  const service = new AdminWebhooksService(asDb(db));
  return { service, db };
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RpcException) {
      return err.getError() as { code: string; message: string };
    }
    throw err;
  }
  throw new Error('expected rejection');
}

function hookRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wh-1',
    workspaceId: 'ws-1',
    projectId: 'p-1',
    url: 'https://example.com/hook',
    secret: 'whsec_x',
    events: ['entry.published'],
    active: true,
    lastStatus: 200,
    lastFiredAt: T1,
    createdAt: T0,
    ...overrides,
  };
}

describe('AdminWebhooksService.list', () => {
  it('unfiltered query → no where clause, dates serialized', async () => {
    const { service, db } = makeService();
    db.query.webhooks.findMany.mockResolvedValue([hookRow()]);
    db.$count.mockResolvedValue(1);

    const page = await service.list({});

    expect(db.query.webhooks.findMany.mock.calls[0][0].where).toBeUndefined();
    expect(page.items[0]).toMatchObject({
      lastFiredAt: T1.toISOString(),
      createdAt: T0.toISOString(),
      lastStatus: 200,
    });
  });

  it('null lastFiredAt serializes to null (never-fired hook)', async () => {
    const { service, db } = makeService();
    db.query.webhooks.findMany.mockResolvedValue([hookRow({ lastFiredAt: null })]);
    db.$count.mockResolvedValue(1);

    const page = await service.list({});
    expect(page.items[0].lastFiredAt).toBeNull();
  });

  it('workspace/project filters apply to both items and total', async () => {
    const { service, db } = makeService();
    db.query.webhooks.findMany.mockResolvedValue([]);

    await service.list({ workspaceId: 'ws-9', projectId: 'p-9' });

    const findWhere = serializeFragment(db.query.webhooks.findMany.mock.calls[0][0].where);
    const countWhere = serializeFragment(db.$count.mock.calls[0][1]);
    for (const where of [findWhere, countWhere]) {
      expect(where).toContain('ws-9');
      expect(where).toContain('p-9');
    }
  });
});

describe('AdminWebhooksService.disable — kill switch', () => {
  it('flips active=false and reports success', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => writeChain([{ id: 'wh-1' }]));

    const result = await service.disable({ id: 'wh-1' });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({ active: false });
    expect(result).toEqual({ success: true });
  });

  it('unknown webhook → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => writeChain([]));

    const err = await rejection(service.disable({ id: 'nope' }));
    expect(err.code).toBe('NOT_FOUND');
  });
});
