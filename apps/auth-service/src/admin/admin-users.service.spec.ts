import { RpcException } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';
import { AdminUsersService } from './admin-users.service';
import * as schema from '../db/schema';
import { asDb, chain, chainOf, createDbMock } from '../testing/drizzle-mock';
import { configStub } from '../testing/config-stub';

const { adminUsers } = schema;

const ACTING_ADMIN = 'a-acting';
const T0 = new Date('2026-01-01T00:00:00.000Z');

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('bcrypt-hashed'),
}));
const hash = bcrypt.hash as unknown as jest.Mock;

function adminRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a-2',
    email: 'other@wriven.dev',
    name: 'Other Admin',
    passwordHash: 'old-hash',
    role: 'admin',
    active: true,
    lastLoginAt: null,
    createdAt: T0,
    ...overrides,
  };
}

function makeService() {
  const db = createDbMock();
  const service = new AdminUsersService(asDb(db), configStub({ BCRYPT_ROUNDS: 4 }));
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

describe('AdminUsersService.create', () => {
  it('duplicate email → CONFLICT before hashing', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue({ id: 'a-2' });

    const err = await rejection(
      service.create({ email: 'other@wriven.dev', name: 'X', password: 'pw', role: 'admin' }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(hash).not.toHaveBeenCalled();
  });

  it('hashes with the configured rounds and never returns the hash', async () => {
    const { service, db } = makeService();
    db.insert.mockImplementationOnce(() => chain([adminRow()]));

    const view = await service.create({
      email: 'other@wriven.dev',
      name: 'Other',
      password: 'pw',
      role: 'admin',
    });

    expect(hash).toHaveBeenCalledWith('pw', 4);
    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'other@wriven.dev', passwordHash: 'bcrypt-hashed' }),
    );
    expect(JSON.stringify(view)).not.toContain('bcrypt-hashed');
  });
});

describe('AdminUsersService.update — self + last-admin guards', () => {
  it('deactivating your own account → CONFLICT', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(adminRow({ id: ACTING_ADMIN }));

    const err = await rejection(
      service.update({
        id: ACTING_ADMIN,
        dto: { active: false },
        actingAdminId: ACTING_ADMIN,
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('demoting the last active admin → CONFLICT', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(adminRow());
    db.$count.mockResolvedValue(1);

    const err = await rejection(
      service.update({
        id: 'a-2',
        dto: { role: 'moderator' },
        actingAdminId: ACTING_ADMIN,
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('inactive admins never trigger the last-admin guard', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(adminRow({ active: false }));
    db.update.mockImplementationOnce(() => chain([adminRow({ active: false })]));

    await expect(
      service.update({
        id: 'a-2',
        dto: { active: false },
        actingAdminId: ACTING_ADMIN,
      }),
    ).resolves.toBeTruthy();
    expect(db.$count).not.toHaveBeenCalled();
  });

  it('only provided fields are patched', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(adminRow({ role: 'moderator', active: false }));
    db.update.mockImplementationOnce(() => chain([adminRow({ role: 'moderator', active: false })]));

    await service.update({
      id: 'a-2',
      dto: { role: 'moderator' },
      actingAdminId: ACTING_ADMIN,
    });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({ role: 'moderator' });
  });
});

describe('AdminUsersService.remove', () => {
  it('deleting your own account → CONFLICT', async () => {
    const { service, db } = makeService();
    const err = await rejection(
      service.remove({ id: ACTING_ADMIN, actingAdminId: ACTING_ADMIN }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(db.query.adminUsers.findFirst).not.toHaveBeenCalled();
  });

  it('deleting the last active admin → CONFLICT', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(adminRow());
    db.$count.mockResolvedValue(1);

    const err = await rejection(service.remove({ id: 'a-2', actingAdminId: ACTING_ADMIN }));
    expect(err.code).toBe('CONFLICT');
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('deleting a non-admin (or non-last admin) proceeds', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(adminRow({ role: 'moderator' }));

    await expect(
      service.remove({ id: 'a-2', actingAdminId: ACTING_ADMIN }),
    ).resolves.toEqual({ success: true });
    expect(db.delete).toHaveBeenCalledWith(adminUsers);
  });
});

describe('AdminUsersService.list', () => {
  it('maps rows to views with pagination envelope', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findMany.mockResolvedValue([adminRow()]);
    db.$count.mockResolvedValue(1);

    const page = await service.list({ q: 'other', page: 1, limit: 20 });

    expect(page).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(page.items[0]).toMatchObject({ id: 'a-2', email: 'other@wriven.dev' });
    expect(JSON.stringify(page.items)).not.toContain('old-hash');
  });
});
