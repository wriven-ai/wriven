import { RpcException } from '@nestjs/microservices';
import { SupportService } from './support.service';
import { writeChain, asDb, createDbMock } from '../testing/drizzle-mock';

/**
 * Tenant-boundary spec for the support subsystem: ticket attachments may only
 * reference R2 keys under the SUBMITTING workspace's prefix — anything else
 * must never reach a presigned URL.
 */
function makeService() {
  const db = createDbMock();
  const storage = { presign: jest.fn() };
  const service = new SupportService(asDb(db), storage as never);
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

const base = {
  workspaceId: '33333333-3333-4333-8333-333333333333',
  userId: 'u-1',
};

describe('SupportService.create — attachment key prefix (cross-tenant guard)', () => {
  it("a foreign workspace's key → VALIDATION_ERROR, no ticket row written", async () => {
    const { service, db } = makeService();
    db.$count.mockResolvedValue(0);

    const err = await rejection(
      service.create({
        ...base,
        dto: {
          subject: 'help',
          description: 'please',
          attachmentKeys: ['support/99999999-9999-4999-8999-999999999999/stolen.png'], // valid shape, FOREIGN workspace
        } as never,
      }),
    );

    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('attachment');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('an arbitrary non-prefixed key (path traversal style) → rejected', async () => {
    const { service, db } = makeService();
    db.$count.mockResolvedValue(0);

    const err = await rejection(
      service.create({
        ...base,
        dto: {
          subject: 'help',
          description: 'please',
          attachmentKeys: ['../../etc/passwd'],
        } as never,
      }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('own-prefix keys pass the guard and create the ticket', async () => {
    const { service, db } = makeService();
    db.$count.mockResolvedValue(0);
    db.insert
      .mockImplementationOnce(() => writeChain([ticketRow()]))
      .mockImplementation(() => writeChain([])); // attachment rows
    db.query.supportTicketMessages.findMany.mockResolvedValue([]);
    db.query.supportTicketAttachments.findMany.mockResolvedValue([]);

    await expect(
      service.create({
        ...base,
        dto: {
          subject: 'help',
          description: 'please',
          attachmentKeys: [`support/${base.workspaceId}/shot.png`],
        } as never,
      }),
    ).resolves.toBeTruthy();
  });

  it('too many open tickets → CONFLICT before any key handling', async () => {
    const { service, db } = makeService();
    db.$count.mockResolvedValue(20); // at the cap

    const err = await rejection(
      service.create({
        ...base,
        dto: { subject: 'help', description: 'please' } as never,
      }),
    );
    expect(err.code).toBe('CONFLICT');
  });
});

function ticketRow() {
  return {
    id: 't-1',
    workspaceId: base.workspaceId,
    authorId: base.userId,
    subject: 'help',
    description: 'please',
    scopeType: 'general',
    status: 'open',
    priority: 'normal',
    assignedTo: null,
    resolution: null,
    resolvedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}
