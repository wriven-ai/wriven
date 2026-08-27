import { RpcException } from '@nestjs/microservices';
import { createHash } from 'node:crypto';
import { ApiKeysService } from './api-keys.service';
import type { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import * as schema from '../db/schema';
import { writeChain, asDb, chainOf, createDbMock, serializeFragment } from '../testing/drizzle-mock';

const { apiKeys } = schema;

const T0 = new Date('2026-01-01T00:00:00.000Z');

function keyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    workspaceId: 'ws-1',
    projectId: 'p1',
    name: 'Site key',
    tokenHash: 'a'.repeat(64),
    prefix: 'wrk_live_abcd',
    scope: 'read',
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdBy: 'u1',
    createdAt: T0,
    ...overrides,
  };
}

function makeService() {
  const db = createDbMock();
  const entitlements = { assertApiKeyQuota: jest.fn().mockResolvedValue(undefined) };
  const service = new ApiKeysService(
    asDb(db),
    entitlements as unknown as CoreEntitlementsService,
  );
  return { service, db, entitlements };
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

describe('ApiKeysService.create — minting', () => {
  it('stores only the sha256 of a scope-prefixed token; raw returned once', async () => {
    const { service, db, entitlements } = makeService();
    db.insert.mockImplementationOnce(() => writeChain([keyRow()]));

    const result = await service.create({
      workspaceId: 'ws-1',
      projectId: 'p1',
      userId: 'u1',
      dto: { name: 'Site key', scope: 'read' },
    });

    expect(entitlements.assertApiKeyQuota).toHaveBeenCalledWith('ws-1');
    expect(result.token).toMatch(/^wrk_live_[A-Za-z0-9_-]{32}$/);

    const values = chainOf(db.insert).values.mock.calls[0][0] as Record<string, unknown>;
    // The stored hash must equal sha256 of the returned raw token — verified
    // by recomputation, not by trusting the code under test.
    expect(values.tokenHash).toBe(createHash('sha256').update(result.token).digest('hex'));
    expect(values.tokenHash).not.toBe(result.token);
    expect(values.prefix).toBe(result.token.slice(0, 'wrk_live_'.length + 4));
    expect(result.key).toMatchObject({ scope: 'read', name: 'Site key' });
    expect(JSON.stringify(result.key)).not.toContain('tokenHash');
  });

  it('scope prefixes are distinct per scope', async () => {
    const { service, db } = makeService();
    db.insert.mockImplementationOnce(() => writeChain([keyRow({ scope: 'manage' })]));

    const result = await service.create({
      workspaceId: 'ws-1',
      projectId: 'p1',
      userId: 'u1',
      dto: { name: 'Admin key', scope: 'manage' },
    });
    expect(result.token).toMatch(/^wrk_admin_/);
  });
});

describe('ApiKeysService.resolve — hot path', () => {
  it('looks the token up by its sha256, never the raw value', async () => {
    const { service, db } = makeService();
    db.query.apiKeys.findFirst.mockResolvedValue(keyRow());

    await service.resolve({ token: 'wrk_live_secret' });

    const hash = createHash('sha256').update('wrk_live_secret').digest('hex');
    const serialized = serializeFragment(db.query.apiKeys.findFirst.mock.calls[0][0]);
    expect(serialized).toContain(hash);
    expect(serialized).not.toContain('wrk_live_secret');
  });

  it('revoked key → null', async () => {
    const { service, db } = makeService();
    db.query.apiKeys.findFirst.mockResolvedValue(keyRow({ revokedAt: T0 }));
    expect(await service.resolve({ token: 'wrk_live_secret' })).toBeNull();
  });

  it('expired key → null', async () => {
    const { service, db } = makeService();
    db.query.apiKeys.findFirst.mockResolvedValue(
      keyRow({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
    );
    expect(await service.resolve({ token: 'wrk_live_secret' })).toBeNull();
  });

  it('valid key → project-scoped resolution + fire-and-forget lastUsedAt', async () => {
    const { service, db } = makeService();
    db.query.apiKeys.findFirst.mockResolvedValue(keyRow());

    const resolution = await service.resolve({ token: 'wrk_live_secret' });

    expect(resolution).toEqual({
      id: 'key-1',
      workspaceId: 'ws-1',
      projectId: 'p1',
      scope: 'read',
    });
    expect(db.update).toHaveBeenCalledWith(apiKeys);
    expect(chainOf(db.update).set).toHaveBeenCalledWith({
      lastUsedAt: expect.any(Date),
    });
  });
});

describe('ApiKeysService.revoke / regenerate', () => {
  it('revoke: unknown or already-revoked → NOT_FOUND before any write', async () => {
    const { service, db } = makeService();
    db.query.apiKeys.findFirst.mockResolvedValue(undefined);

    const err = await rejection(
      service.revoke({ workspaceId: 'ws-1', projectId: 'p1', id: 'nope' }),
    );
    expect(err.code).toBe('NOT_FOUND');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('revoke stamps revokedAt', async () => {
    const { service, db } = makeService();
    db.query.apiKeys.findFirst.mockResolvedValue(keyRow());
    db.update.mockImplementationOnce(() => writeChain([keyRow({ revokedAt: new Date() })]));

    await expect(
      service.revoke({ workspaceId: 'ws-1', projectId: 'p1', id: 'key-1' }),
    ).resolves.toEqual({ success: true });
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ revokedAt: expect.any(Date) });
  });

  it('regenerate: same row, fresh secret, scope preserved, lastUsedAt reset', async () => {
    const { service, db } = makeService();
    db.query.apiKeys.findFirst.mockResolvedValue(keyRow({ scope: 'preview' }));
    db.update.mockImplementationOnce(() => writeChain([keyRow({ scope: 'preview' })]));

    const result = await service.regenerate({ workspaceId: 'ws-1', projectId: 'p1', id: 'key-1' });

    expect(result.token).toMatch(/^wrk_preview_[A-Za-z0-9_-]{32}$/);
    const set = chainOf(db.update).set.mock.calls[0][0] as Record<string, unknown>;
    expect(set.tokenHash).toBe(createHash('sha256').update(result.token).digest('hex'));
    expect(set).toMatchObject({ lastUsedAt: null, createdAt: expect.any(Date) });
  });

  it('regenerate on a concurrently-revoked key (empty returning) → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.apiKeys.findFirst.mockResolvedValue(keyRow());
    db.update.mockImplementationOnce(() => writeChain([])); // row gone at write time

    const err = await rejection(
      service.regenerate({ workspaceId: 'ws-1', projectId: 'p1', id: 'key-1' }),
    );
    expect(err.code).toBe('NOT_FOUND');
  });
});
