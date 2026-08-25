import { Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';
import { AdminAuthService } from './admin-auth.service';
import type { AdminTokenService } from './admin-token.service';
import * as schema from '../db/schema';
import { asDb, chain, chainOf, createDbMock, serializeFragment } from '../testing/drizzle-mock';

const { adminRefreshTokens } = schema;

// AdminAuthService hashes a dummy password at construction (anti-enumeration
// timing) — the module must be mocked wherever the class is instantiated.
jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(false),
  hashSync: jest.fn(() => 'dummy-hash'),
}));
const compare = bcrypt.compare as unknown as jest.Mock;

const ADMIN_ID = 'a-1';
const T0 = new Date('2026-01-01T00:00:00.000Z');

function adminRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ADMIN_ID,
    email: 'admin@wriven.dev',
    name: 'Root Admin',
    passwordHash: 'real-hash',
    role: 'admin',
    active: true,
    lastLoginAt: null,
    createdAt: T0,
    ...overrides,
  };
}

function tokenStub() {
  return {
    hash: jest.fn((raw: string) => `hashed:${raw}`),
    newRefreshToken: jest.fn(() => ({ raw: 'raw-token', hash: 'hashed:raw-token' })),
    refreshExpiresAt: jest.fn(() => new Date('2030-01-01T00:00:00.000Z')),
    signAccessToken: jest.fn(() => 'access-token'),
  };
}

function makeService() {
  const db = createDbMock();
  const tokens = tokenStub();
  const service = new AdminAuthService(asDb(db), tokens as unknown as AdminTokenService);
  return { service, db, tokens };
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

beforeAll(() => {
  Logger.overrideLogger([]);
});

describe('AdminAuthService.login', () => {
  it('unknown email → dummy bcrypt compare (timing equalised) + INVALID_CREDENTIALS', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(undefined);
    compare.mockResolvedValueOnce(false);

    const err = await rejection(
      service.login({ email: 'ghost@wriven.dev', password: 'pw' }),
    );

    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(compare).toHaveBeenCalledWith('pw', 'dummy-hash');
  });

  it('wrong password → INVALID_CREDENTIALS', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(adminRow());
    compare.mockResolvedValueOnce(false);

    const err = await rejection(
      service.login({ email: 'admin@wriven.dev', password: 'wrong' }),
    );
    expect(err.code).toBe('INVALID_CREDENTIALS');
  });

  it('disabled admin → FORBIDDEN even with correct credentials', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(adminRow({ active: false }));
    compare.mockResolvedValueOnce(true);

    const err = await rejection(
      service.login({ email: 'admin@wriven.dev', password: 'pw' }),
    );
    expect(err.code).toBe('FORBIDDEN');
    expect(db.insert).not.toHaveBeenCalled(); // no session issued
  });

  it('success: session inserted, lastLoginAt stamped, view returned without hash', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(adminRow());
    compare.mockResolvedValueOnce(true);
    db.insert.mockImplementationOnce(() => chain([]));
    db.update.mockImplementationOnce(() => chain([adminRow()]));

    const result = await service.login({ email: 'admin@wriven.dev', password: 'pw' });

    expect(db.insert).toHaveBeenCalledWith(adminRefreshTokens);
    expect(chainOf(db.update).set).toHaveBeenCalledWith(
      expect.objectContaining({ lastLoginAt: expect.any(Date) }),
    );
    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'raw-token',
    });
    expect(result.admin).toMatchObject({ id: ADMIN_ID, role: 'admin', active: true });
    expect(JSON.stringify(result.admin)).not.toContain('real-hash');
  });
});

describe('AdminAuthService.refresh — rotation + theft detection', () => {
  function refreshTokenRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'rt-1',
      tokenHash: 'hashed:raw-token',
      adminUserId: ADMIN_ID,
      revoked: false,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      createdAt: T0,
      ...overrides,
    };
  }

  it('unknown refresh token → INVALID_REFRESH_TOKEN', async () => {
    const { service, db } = makeService();
    db.query.adminRefreshTokens.findFirst.mockResolvedValue(undefined);

    const err = await rejection(service.refresh({ refreshToken: 'unknown' }));
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('revoked-token reuse → theft: EVERY session for that admin revoked', async () => {
    const { service, db } = makeService();
    db.query.adminRefreshTokens.findFirst.mockResolvedValue(
      refreshTokenRow({ revoked: true }),
    );
    db.update.mockImplementationOnce(() => chain([]));

    const err = await rejection(service.refresh({ refreshToken: 'raw-token' }));

    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
    expect(db.update).toHaveBeenCalledWith(adminRefreshTokens);
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ revoked: true });
    // Pin the WHERE scope: revocation targets the ADMIN (all their sessions),
    // not just the presented token row.
    const where = serializeFragment(chainOf(db.update).where.mock.calls[0][0]);
    expect(where).toContain(ADMIN_ID);
    expect(where).not.toContain('rt-1');
  });

  it('expired refresh token → INVALID_REFRESH_TOKEN', async () => {
    const { service, db } = makeService();
    db.query.adminRefreshTokens.findFirst.mockResolvedValue(
      refreshTokenRow({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
    );

    const err = await rejection(service.refresh({ refreshToken: 'raw-token' }));
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('admin deleted/deactivated mid-session → INVALID_REFRESH_TOKEN', async () => {
    const { service, db } = makeService();
    db.query.adminRefreshTokens.findFirst.mockResolvedValue(refreshTokenRow());
    db.query.adminUsers.findFirst.mockResolvedValue(adminRow({ active: false }));

    const err = await rejection(service.refresh({ refreshToken: 'raw-token' }));
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('valid rotation: old revoked + new inserted in one tx, new tokens returned', async () => {
    const { service, db, tokens } = makeService();
    db.query.adminRefreshTokens.findFirst.mockResolvedValue(refreshTokenRow());
    db.query.adminUsers.findFirst.mockResolvedValue(adminRow());

    const result = await service.refresh({ refreshToken: 'raw-token' });

    expect(db.__tx.update).toHaveBeenCalledWith(adminRefreshTokens);
    expect(chainOf(db.__tx.update).set).toHaveBeenCalledWith({ revoked: true });
    expect(db.__tx.insert).toHaveBeenCalledWith(adminRefreshTokens);
    expect(chainOf(db.__tx.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: 'hashed:raw-token', adminUserId: ADMIN_ID }),
    );
    expect(tokens.signAccessToken).toHaveBeenCalledWith({
      id: ADMIN_ID,
      email: 'admin@wriven.dev',
      role: 'admin',
    });
    expect(result.refreshToken).toBe('raw-token');
  });
});

describe('AdminAuthService.logout / getById', () => {
  it('logout revokes exactly the presented token', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => chain([]));

    await expect(
      service.logout({ refreshToken: 'raw-token' }),
    ).resolves.toEqual({ success: true });

    expect(db.update).toHaveBeenCalledWith(adminRefreshTokens);
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ revoked: true });
  });

  it('getById: unknown → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(undefined);
    const err = await rejection(service.getById({ adminUserId: 'nope' }));
    expect(err.code).toBe('NOT_FOUND');
  });

  it('getById returns the view', async () => {
    const { service, db } = makeService();
    db.query.adminUsers.findFirst.mockResolvedValue(
      adminRow({ lastLoginAt: new Date('2026-02-01T00:00:00.000Z') }),
    );
    const view = await service.getById({ adminUserId: ADMIN_ID });
    expect(view.lastLoginAt).toBe('2026-02-01T00:00:00.000Z');
  });
});
