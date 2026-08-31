import { RpcException } from '@nestjs/microservices';
import { SupportService } from './support.service';
import * as schema from '../db/schema';
import {
  writeChain,
  asDb,
  chainOf,
  createDbMock,
  serializeFragment,
} from '../testing/drizzle-mock';

const T0 = new Date('2026-01-15T10:00:00.000Z');

// $inferSelect-typed fixtures — a schema change that drops/renames a column
// breaks this file at compile time instead of silently drifting.
type TicketRow = typeof schema.supportTickets.$inferSelect;
type MessageRow = typeof schema.supportTicketMessages.$inferSelect;

function ticketRow(
  overrides: Partial<TicketRow> = {},
): TicketRow & { attachments?: unknown[] } {
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

function messageRow(overrides: Partial<MessageRow> = {}) {
  return {
    id: 'm-1',
    ticketId: 't-1',
    authorType: 'user',
    authorId: 'u-author',
    body: 'hello',
    isInternalNote: false,
    createdAt: T0,
    attachments: [], // relational `with` shape
    ...overrides,
  };
}

function makeService() {
  const db = createDbMock();
  const storage = {
    presignUpload: jest.fn().mockResolvedValue('https://signed.example/put'),
    publicUrl: jest.fn((key: string) => `https://cdn.example/${key}`),
  };
  const service = new SupportService(asDb(db), storage as never);
  return { service, db, storage };
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

const base = { workspaceId: 'ws-1', userId: 'u-author' };

describe('SupportService.get — visibility + internal-note redaction', () => {
  it('non-author without an owner/admin role → FORBIDDEN', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow());

    const err = await rejection(
      service.get({ ...base, userId: 'u-other', workspaceRole: 'member', id: 't-1' }),
    );
    expect(err.code).toBe('FORBIDDEN');
  });

  it('author reads their ticket; internal staff notes are REDACTED from it', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow());
    db.query.supportTicketMessages.findMany.mockResolvedValue([
      messageRow({ id: 'm-1', body: 'customer message' }),
      messageRow({
        id: 'm-2',
        authorType: 'admin',
        body: 'internal: user is on the free plan, upsell later',
        isInternalNote: true,
      }),
    ]);

    const detail = await service.get({
      ...base,
      workspaceRole: 'member',
      id: 't-1',
    });

    expect(detail.messages.map((m) => m.id)).toEqual(['m-1']);
    expect(JSON.stringify(detail)).not.toContain('upsell');
  });

  it('privileged workspace role reads another member\'s ticket (notes still redacted)', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow());
    db.query.supportTicketMessages.findMany.mockResolvedValue([
      messageRow({ isInternalNote: true, body: 'secret' }),
    ]);

    const detail = await service.get({
      ...base,
      userId: 'u-other',
      workspaceRole: 'owner',
      id: 't-1',
    });

    expect(detail.messages).toEqual([]);
  });
});

describe('SupportService.list — who sees whose tickets', () => {
  it('member list is scoped to the workspace AND their own authorId', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findMany.mockResolvedValue([ticketRow()]);

    await service.list({
      ...base,
      userId: 'u-me',
      workspaceRole: 'member',
      dto: {},
    });

    const where = serializeFragment(
      db.query.supportTickets.findMany.mock.calls[0][0].where,
    );
    expect(where).toContain('ws-1');
    expect(where).toContain('u-me'); // non-privileged: own tickets only
    expect(db.$count.mock.calls[0][0]).toBe(schema.supportTickets);
  });

  it('owner/admin list sees every ticket in the workspace (no authorId filter)', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findMany.mockResolvedValue([ticketRow()]);

    await service.list({
      ...base,
      userId: 'u-me',
      workspaceRole: 'admin',
      dto: {},
    });

    const where = serializeFragment(
      db.query.supportTickets.findMany.mock.calls[0][0].where,
    );
    expect(where).toContain('ws-1');
    expect(where).not.toContain('u-me');
  });
});

describe('SupportService.reply', () => {
  it('closed ticket → CONFLICT, no message written', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow({ status: 'closed' }));

    const err = await rejection(
      service.reply({ ...base, id: 't-1', dto: { body: 'hi' } as never }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', 'open'],
    ['resolved', 'open'],
    ['open', 'open'],
  ])('%s ticket → status %s after a user reply (reopen semantics)', async (from, to) => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(
      ticketRow({ status: from as TicketRow['status'] }),
    );
    db.insert.mockImplementationOnce(() => writeChain([messageRow()]));

    const detail = await service.reply({
      ...base,
      id: 't-1',
      dto: { body: 'hi' } as never,
    });

    expect(detail.status).toBe(to);
    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 't-1',
        authorType: 'user',
        authorId: 'u-author',
        isInternalNote: false, // a user can never file an internal note
      }),
    );
    expect(chainOf(db.update).set).toHaveBeenCalledWith(
      expect.objectContaining({ status: to, lastReplyBy: 'user' }),
    );
  });
});

describe('SupportService.close', () => {
  it('only the author may close — another member → FORBIDDEN', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow());

    const err = await rejection(
      service.close({ ...base, userId: 'u-other', id: 't-1' }),
    );
    expect(err.code).toBe('FORBIDDEN');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('author close stamps closedAt; closing twice is idempotent (no second write)', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow({ status: 'closed' }));

    await service.close({ ...base, id: 't-1' });

    expect(db.update).not.toHaveBeenCalled(); // already closed — read-only path
  });

  it('open ticket → closed with closedAt', async () => {
    const { service, db } = makeService();
    db.query.supportTickets.findFirst.mockResolvedValue(ticketRow());
    db.update.mockImplementationOnce(() =>
      writeChain([ticketRow({ status: 'closed', closedAt: T0 })]),
    );

    const detail = await service.close({ ...base, id: 't-1' });

    expect(detail.status).toBe('closed');
    expect(chainOf(db.update).set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'closed', closedAt: expect.any(Date) }),
    );
  });
});

describe('SupportService.presign — attachment uploads', () => {
  it('image-only, ≤5 MB, keyed under the workspace support prefix', async () => {
    const { service, storage } = makeService();

    const result = await service.presign({
      workspaceId: 'ws-1',
      userId: 'u-1',
      dto: { filename: 'shot.png', contentType: 'image/png', size: 1024 } as never,
    });

    expect(result.key).toMatch(/^support\/ws-1\/[0-9a-f-]+\.png$/);
    // (tier-1 adds a third contentLength arg here; only pin the invariant pair)
    const [key, contentType] = storage.presignUpload.mock.calls[0];
    expect(key).toBe(result.key);
    expect(contentType).toBe('image/png');
  });

  it('non-image content type → VALIDATION_ERROR', async () => {
    const { service } = makeService();
    const err = await rejection(
      service.presign({
        workspaceId: 'ws-1',
        userId: 'u-1',
        dto: { filename: 'a.pdf', contentType: 'application/pdf', size: 10 } as never,
      }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('oversized image → VALIDATION_ERROR', async () => {
    const { service } = makeService();
    const err = await rejection(
      service.presign({
        workspaceId: 'ws-1',
        userId: 'u-1',
        dto: { filename: 'big.png', contentType: 'image/png', size: 6 * 1024 * 1024 } as never,
      }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});
