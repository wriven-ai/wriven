import { RpcException } from '@nestjs/microservices';
import { AdminSupportService } from './admin-support.service';
import * as schema from '../db/schema';
import {
  chain,
  writeChain,
  asDb,
  chainOf,
  createDbMock,
  serializeFragment,
} from '../testing/drizzle-mock';

const T0 = new Date('2026-01-15T10:00:00.000Z');

type TicketRow = typeof schema.supportTickets.$inferSelect;

function ticketRow(overrides: Partial<TicketRow> = {}): TicketRow {
  return {
    id: 't-1',
    workspaceId: 'ws-1',
    number: 42,
    subject: 'Something broke',
    description: 'details',
    scopeType: 'general',
    scopeProjectId: null,
    status: 'open',
    priority: 'normal',
    assignedAdminId: null,
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    lastReplyAt: null,
    lastReplyBy: null,
    deletedAt: null,
    authorId: 'u-author',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function makeService() {
  const db = createDbMock();
  const storage = { publicUrl: jest.fn((k: string) => `https://cdn.example/${k}`) };
  const service = new AdminSupportService(asDb(db), storage as never);
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

describe('AdminSupportService.get — staff view keeps internal notes', () => {
  it('includes internal notes and flags them (contrast: user view redacts)', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow());
    db.query.supportTicketMessages.findMany.mockResolvedValue([
      {
        id: 'm-1',
        ticketId: 't-1',
        authorType: 'admin',
        authorId: 'a-1',
        body: 'note',
        isInternalNote: true,
        createdAt: T0,
        attachments: [],
      },
    ]);

    const detail = await service.get('t-1');

    expect(detail.messages).toHaveLength(1);
    expect(detail.messages[0].isInternalNote).toBe(true);
  });
});

describe('AdminSupportService.reply — note vs public reply semantics', () => {
  it('PUBLIC reply → status pending + firstRespondedAt stamped on first response', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow());
    db.insert.mockImplementationOnce(() =>
      writeChain([{ id: 'm-1', body: 'answer', isInternalNote: false }]),
    );
    db.update.mockImplementationOnce(() =>
      writeChain([ticketRow({ status: 'pending', firstRespondedAt: T0 })]),
    );

    await service.reply({ id: 't-1', adminUserId: 'a-1', dto: { body: 'answer' } as never });

    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ authorType: 'admin', isInternalNote: false }),
    );
    expect(chainOf(db.update).set.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        status: 'pending',
        firstRespondedAt: expect.any(Date),
        lastReplyBy: 'admin',
      }),
    );
  });

  it('INTERNAL note → status untouched, firstRespondedAt NOT stamped', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow());
    db.insert.mockImplementationOnce(() =>
      writeChain([{ id: 'm-1', body: 'note', isInternalNote: true }]),
    );
    db.update.mockImplementationOnce(() => writeChain([ticketRow()]));

    await service.reply({
      id: 't-1',
      adminUserId: 'a-1',
      dto: { body: 'note', internalNote: true } as never,
    });

    const set = chainOf(db.update).set.mock.calls[0][0] as Record<string, unknown>;
    expect(set.status).toBeUndefined(); // a note never flips the queue state
    expect(set.firstRespondedAt).toBeUndefined(); // nor counts as a response
    expect(set.lastReplyBy).toBe('admin');
  });

  it('already first-responded → firstRespondedAt NOT overwritten', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(
      ticketRow({ firstRespondedAt: T0 }),
    );
    db.insert.mockImplementationOnce(() => writeChain([{ id: 'm-2' }]));
    db.update.mockImplementationOnce(() => writeChain([ticketRow()]));

    await service.reply({ id: 't-1', adminUserId: 'a-1', dto: { body: 'again' } as never });

    const set = chainOf(db.update).set.mock.calls[0][0] as Record<string, unknown>;
    expect(set.firstRespondedAt).toBeUndefined();
  });

  it('closed ticket → CONFLICT, nothing written', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow({ status: 'closed' }));

    const err = await rejection(
      service.reply({ id: 't-1', adminUserId: 'a-1', dto: { body: 'x' } as never }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('AdminSupportService.update — lifecycle stamps', () => {
  it.each([
    ['resolved', 'resolvedAt'],
    ['closed', 'closedAt'],
  ] as const)('status %s stamps %s', async (status, stamp) => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow());
    db.update.mockImplementationOnce(() => writeChain([ticketRow()]));

    await service.update({ id: 't-1', dto: { status } as never });

    expect(chainOf(db.update).set.mock.calls[0][0]).toEqual(
      expect.objectContaining({ status, [stamp]: expect.any(Date) }),
    );
  });

  it('assignedAdminId: null explicitly unassigns (a key-presence check, not !== undefined)', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(
      ticketRow({ assignedAdminId: 'a-1' }),
    );
    db.update.mockImplementationOnce(() => writeChain([ticketRow()]));

    await service.update({ id: 't-1', dto: { assignedAdminId: null } as never });

    expect(chainOf(db.update).set.mock.calls[0][0]).toEqual(
      expect.objectContaining({ assignedAdminId: null }),
    );
  });

  it('priority-only patch touches neither status nor stamps', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow());
    db.update.mockImplementationOnce(() => writeChain([ticketRow()]));

    await service.update({ id: 't-1', dto: { priority: 'high' } as never });

    const set = chainOf(db.update).set.mock.calls[0][0] as Record<string, unknown>;
    expect(set.status).toBeUndefined();
    expect(set.resolvedAt).toBeUndefined();
    expect(set.closedAt).toBeUndefined();
    expect(set.priority).toBe('high');
  });
});

describe('AdminSupportService.metrics', () => {
  it('maps the filtered count row into SupportMetrics with Number coercion', async () => {
    const { service, db } = makeService();
    db.select.mockImplementationOnce(() =>
      chain([
        {
          open: '3',
          pending: '2',
          resolved: '1',
          closed: '4',
          unassigned: '5',
          total: '10',
        },
      ]),
    );

    const m = await service.metrics();

    expect(m).toEqual({
      open: 3,
      pending: 2,
      resolved: 1,
      closed: 4,
      unassigned: 5,
      total: 10,
    });
    // The count query excludes deleted tickets.
    expect(
      serializeFragment(chainOf(db.select).where.mock.calls[0][0]),
    ).toContain('deletedAt');
  });
});

describe('AdminSupportService.list — filters', () => {
  it('builds the search/unassignment predicates and shares them with $count', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findMany.mockResolvedValue([ticketRow()]);

    await service.list({
      q: 'broken',
      unassigned: true,
      status: 'open',
      workspaceId: 'ws-1',
    } as never);

    const where = serializeFragment(
      db.query.supportTickets.findMany.mock.calls[0][0].where,
    );
    expect(where).toContain('%broken%'); // search term bound
    expect(where).toContain('ws-1');
    expect(where).toContain('open');
    expect(where).toContain('assignedAdminId'); // unassigned → is-null predicate
    expect(db.$count.mock.calls[0][0]).toBe(schema.supportTickets);
    // Same where drives the count — items/total can never disagree.
    expect(serializeFragment(db.$count.mock.calls[0][1])).toEqual(where);
  });
});
