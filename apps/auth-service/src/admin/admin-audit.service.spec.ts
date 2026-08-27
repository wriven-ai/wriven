import { AdminAuditService } from './admin-audit.service';
import * as schema from '../db/schema';
import { chain, writeChain, asDb, chainOf, createDbMock } from '../testing/drizzle-mock';

const { adminAuditLog } = schema;

const T0 = new Date('2026-01-15T10:00:00.000Z');

function makeService() {
  const db = createDbMock();
  const service = new AdminAuditService(asDb(db));
  return { service, db };
}

describe('AdminAuditService.write', () => {
  it('normalizes optional fields and appends', async () => {
    const { service, db } = makeService();
    db.insert.mockImplementationOnce(() => writeChain([]));

    await service.write({ adminUserId: 'a-1', action: 'plan.updated' });

    expect(db.insert).toHaveBeenCalledWith(adminAuditLog);
    expect(chainOf(db.insert).values).toHaveBeenCalledWith({
      adminUserId: 'a-1',
      action: 'plan.updated',
      targetType: null,
      targetId: null,
      metadata: {},
      ip: null,
    });
  });
});

describe('AdminAuditService.list', () => {
  function auditRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'log-1',
      adminUserId: 'a-1',
      adminEmail: 'admin@wriven.dev',
      action: 'user.suspended',
      targetType: 'user',
      targetId: 'u-9',
      metadata: { reason: 'abuse' },
      ip: '10.0.0.1',
      createdAt: T0,
      ...overrides,
    };
  }

  it('paginates with the envelope shape', async () => {
    const { service, db } = makeService();
    db.select.mockImplementationOnce(() => chain([auditRow()]));
    db.$count.mockResolvedValue(11);

    const page = await service.list({ page: 2, limit: 10 });

    expect(page).toMatchObject({ page: 2, limit: 10, total: 11 });
    expect(page.items[0]).toMatchObject({
      id: 'log-1',
      adminEmail: 'admin@wriven.dev',
      ip: '10.0.0.1',
      createdAt: T0.toISOString(),
    });
    expect(chainOf(db.select).offset).toHaveBeenCalledWith(10);
  });

  it('defaults page 1 / limit 20', async () => {
    const { service, db } = makeService();
    db.select.mockImplementationOnce(() => chain([]));
    db.$count.mockResolvedValue(0);

    const page = await service.list({});

    expect(page).toMatchObject({ page: 1, limit: 20 });
    expect(chainOf(db.select).offset).toHaveBeenCalledWith(0);
  });

  it('survives a deleted admin actor via the left join (null email)', async () => {
    const { service, db } = makeService();
    db.select.mockImplementationOnce(() =>
      chain([auditRow({ adminUserId: null, adminEmail: null })]),
    );
    db.$count.mockResolvedValue(1);

    const page = await service.list({});

    expect(page.items[0]).toMatchObject({ adminUserId: null, adminEmail: null });
  });
});
