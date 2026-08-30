import { RpcException } from '@nestjs/microservices';
import { AdminKeysService } from './admin-keys.service';
import { writeChain, asDb, chainOf, createDbMock, serializeFragment } from '../testing/drizzle-mock';
import * as schema from '../db/schema';

const { apiKeys } = schema;

function makeService() {
  const db = createDbMock();
  const service = new AdminKeysService(asDb(db));
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

describe('AdminKeysService.revoke — platform-level key kill', () => {
  it('stamps revokedAt scoped to exactly the presented key', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => writeChain([{ id: 'key-1' }]));

    await expect(service.revoke({ id: 'key-1' })).resolves.toEqual({ success: true });

    expect(db.update).toHaveBeenCalledWith(apiKeys);
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ revokedAt: expect.any(Date) });
    // Revocation is scoped: a blanket update would kill every tenant's keys.
    const where = serializeFragment(chainOf(db.update).where.mock.calls[0][0]);
    expect(where).toContain('key-1');
  });

  it('unknown key (empty returning) → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => writeChain([]));

    const err = await rejection(service.revoke({ id: 'nope' }));
    expect(err.code).toBe('NOT_FOUND');
  });
});
