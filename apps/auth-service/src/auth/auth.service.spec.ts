import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import { ERROR_CODES, GoogleProfile } from '@wriven/contracts';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import type { AuthorizationService } from './authorization.service';
import type { InvitationsService } from './invitations.service';
import type { MailService } from './mail.service';
import { TokenService } from './token.service';
import { configStub } from '../testing/config-stub';
import {
  writeChain,
  asDb,
  chainOf,
  createDbMock,
  expectScopedWhere,
} from '../testing/drizzle-mock';
import { serializeFragment } from '../testing/drizzle-mock';
import { userRow, workspaceRow } from '../testing/fixtures';
import * as schema from '../db/schema';

// AuthService hashes a dummy password on first unknown-email login
// (anti-enumeration timing) — the module mock keeps suite startup instant.
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-new'),
  compare: jest.fn().mockResolvedValue(false),
  hashSync: jest.fn(() => 'dummy-hash'),
}));

const {
  users,
  workspaces,
  workspaceMembers,
  refreshTokens,
  passwordResetTokens,
  emailVerificationTokens,
  subscriptions,
} = schema;

// jest.mocked() collapses bcrypt's overloaded signatures to `never` params.
const mockedHash = bcrypt.hash as unknown as jest.Mock;
const mockedCompare = bcrypt.compare as unknown as jest.Mock;
const mockedHashSync = jest.requireMock('bcrypt').hashSync as jest.Mock;

beforeAll(() => {
  Logger.overrideLogger([]);
});

beforeEach(() => {
  mockedHash.mockReset().mockResolvedValue('hashed-new');
  mockedCompare.mockReset().mockResolvedValue(false);
});

function makeService(configMap: Record<string, unknown> = {}) {
  const db = createDbMock();
  const config = configStub(configMap);
  const jwt = { sign: jest.fn(() => 'access-token') } as unknown as JwtService;
  // Real TokenService: sha256/HMAC math must match what the service stores.
  const tokens = new TokenService(jwt, config);
  const mail = {
    sendPasswordReset: jest.fn(),
    sendVerification: jest.fn(),
    sendInvitation: jest.fn(),
  };
  const invitations = { claimPending: jest.fn().mockResolvedValue(undefined) };
  const authz = { resolveRoles: jest.fn() };
  const service = new AuthService(
    asDb(db),
    tokens,
    config,
    mail as unknown as MailService,
    invitations as unknown as InvitationsService,
    authz as unknown as AuthorizationService,
  );
  return { service, db, tx: db.__tx, config, mail, invitations, authz, tokens };
}

/** Await the rejection and unwrap the RpcException payload (code/message/status). */
async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RpcException) {
      return err.getError() as {
        code: string;
        message: string;
        statusCode: number;
      };
    }
    throw err;
  }
  throw new Error('expected the call to reject');
}

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

// ── Login ────────────────────────────────────────────────────────────────────

describe('AuthService.login', () => {
  it('missing user: dummy compare + INVALID_CREDENTIALS (anti-enumeration)', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(undefined);
    const err = await rejection(
      service.login({ email: 'x@y.z', password: 'pw' }),
    );
    expect(err.code).toBe(ERROR_CODES.INVALID_CREDENTIALS.code);
    expect(mockedCompare).toHaveBeenCalledWith('pw', 'dummy-hash');
    // Dummy hash derives from the SAME configured rounds as real hashes.
    expect(mockedHashSync).toHaveBeenCalledWith('wriven-dummy-password', 12);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('user without a password hash follows the same dummy path', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(
      userRow({ passwordHash: null }),
    );
    const err = await rejection(
      service.login({ email: 'user@example.com', password: 'pw' }),
    );
    expect(err.code).toBe(ERROR_CODES.INVALID_CREDENTIALS.code);
    expect(mockedCompare).toHaveBeenCalledWith('pw', 'dummy-hash');
    // Dummy hash derives from the SAME configured rounds as real hashes.
    expect(mockedHashSync).toHaveBeenCalledWith('wriven-dummy-password', 12);
  });

  it('wrong password → INVALID_CREDENTIALS, no session', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(userRow());
    mockedCompare.mockResolvedValue(false);
    const err = await rejection(
      service.login({ email: 'user@example.com', password: 'wrong' }),
    );
    expect(err.code).toBe(ERROR_CODES.INVALID_CREDENTIALS.code);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('suspended account → FORBIDDEN, no refresh row', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(
      userRow({ suspendedAt: new Date() }),
    );
    mockedCompare.mockResolvedValue(true);
    const err = await rejection(
      service.login({ email: 'user@example.com', password: 'pw' }),
    );
    expect(err.code).toBe(ERROR_CODES.FORBIDDEN.code);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('success: inserts a refresh row and returns tokens + workspace', async () => {
    const { service, db } = makeService();
    const user = userRow();
    db.query.users.findFirst.mockResolvedValue(user);
    mockedCompare.mockResolvedValue(true);
    db.query.workspaceMembers.findFirst.mockResolvedValue({
      workspace: workspaceRow(),
      role: 'owner',
    });

    const result = await service.login({
      email: user.email,
      password: 'pw',
    });

    expect(result.accessToken).toBe('access-token');
    expect(typeof result.refreshToken).toBe('string');
    expect(result.user.email).toBe(user.email);
    expect(result.workspace).toMatchObject({ id: 'ws-1', role: 'owner' });
    expect(db.insert).toHaveBeenCalledWith(refreshTokens);
    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, rememberMe: false }),
    );
  });

  it('rememberMe propagates to the refresh row', async () => {
    const { service, db } = makeService();
    const user = userRow();
    db.query.users.findFirst.mockResolvedValue(user);
    mockedCompare.mockResolvedValue(true);
    db.query.workspaceMembers.findFirst.mockResolvedValue({
      workspace: workspaceRow(),
      role: 'owner',
    });

    await service.login({ email: user.email, password: 'pw', rememberMe: true });

    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, rememberMe: true }),
    );
  });

  it('no workspace membership → INTERNAL_ERROR', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(userRow());
    mockedCompare.mockResolvedValue(true);
    // workspaceMembers.findFirst left at its default (undefined).
    const err = await rejection(
      service.login({ email: 'user@example.com', password: 'pw' }),
    );
    expect(err.code).toBe(ERROR_CODES.INTERNAL_ERROR.code);
  });
});

// ── Register ─────────────────────────────────────────────────────────────────

describe('AuthService.register', () => {
  const dto = { email: 'new@example.com', password: 'pw12345', name: 'New User' };

  it('existing email → EMAIL_ALREADY_EXISTS', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue({ id: 'existing' });
    const err = await rejection(service.register(dto));
    expect(err.code).toBe(ERROR_CODES.EMAIL_ALREADY_EXISTS.code);
  });

  it('happy path: tx writes user+workspace+owner member+refresh+free subscription', async () => {
    const { service, tx, invitations } = makeService();
    const user = userRow({ email: dto.email, name: dto.name });
    tx.query.plans.findFirst.mockResolvedValue({ id: 'free-plan-id' });
    tx.insert.mockImplementationOnce(() => writeChain([user]))
      .mockImplementationOnce(() => writeChain([workspaceRow()]));

    const result = await service.register(dto);

    expect(tx.insert.mock.calls.map((c) => c[0])).toEqual([
      users,
      workspaces,
      workspaceMembers,
      refreshTokens,
      subscriptions,
    ]);
    expect(chainOf(tx.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: dto.email,
        name: dto.name,
        passwordHash: 'hashed-new',
        provider: 'local',
      }),
    );
    expect(chainOf(tx.insert, 1).values).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: user.id, slug: expect.any(String) }),
    );
    expect(result.workspace).toMatchObject({ role: 'owner' });
    expect(invitations.claimPending).toHaveBeenCalledWith(user.id, dto.email);
  });

  it('missing free plan: skips the subscription insert, still succeeds', async () => {
    const { service, tx } = makeService();
    tx.query.plans.findFirst.mockResolvedValue(undefined);
    tx.insert.mockImplementationOnce(() => writeChain([userRow({ email: dto.email })]))
      .mockImplementationOnce(() => writeChain([workspaceRow()]));

    const result = await service.register(dto);

    expect(tx.insert.mock.calls.map((c) => c[0])).toEqual([
      users,
      workspaces,
      workspaceMembers,
      refreshTokens,
    ]);
    expect(result.user.email).toBe(dto.email);
  });

  it('unique-violation race on email → EMAIL_ALREADY_EXISTS', async () => {
    const { service, tx } = makeService();
    const dup = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'users_email_uq',
    });
    tx.insert.mockImplementationOnce(() => {
      throw dup;
    });
    const err = await rejection(service.register(dto));
    expect(err.code).toBe(ERROR_CODES.EMAIL_ALREADY_EXISTS.code);
  });

  it('non-email unique violation rethrown raw', async () => {
    const { service, tx } = makeService();
    const dup = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'workspaces_created_by_slug_uq',
    });
    tx.insert.mockImplementationOnce(() => writeChain([userRow({ email: dto.email })]))
      .mockImplementationOnce(() => {
        throw dup;
      });
    await expect(service.register(dto)).rejects.toBe(dup);
  });

  it('non-Postgres error rethrown raw', async () => {
    const { service, tx } = makeService();
    const boom = new Error('boom');
    tx.insert.mockImplementationOnce(() => {
      throw boom;
    });
    await expect(service.register(dto)).rejects.toBe(boom);
  });

  it('invite auto-claim failure is swallowed', async () => {
    const { service, tx, invitations } = makeService();
    tx.query.plans.findFirst.mockResolvedValue({ id: 'free-plan-id' });
    tx.insert.mockImplementationOnce(() => writeChain([userRow({ email: dto.email })]))
      .mockImplementationOnce(() => writeChain([workspaceRow()]));
    invitations.claimPending.mockRejectedValue(new Error('invite svc down'));

    const result = await service.register(dto);
    expect(result.user.email).toBe(dto.email);
  });
});

// ── Refresh (mandatory rotation) ─────────────────────────────────────────────

describe('AuthService.refresh', () => {
  const row = {
    id: 'rt-1',
    userId: '11111111-1111-4111-8111-111111111111',
    tokenHash: 'irrelevant-mock',
    expiresAt: FUTURE,
    revoked: false,
    rememberMe: true,
    createdAt: PAST,
  };

  it('unknown token → INVALID_REFRESH_TOKEN', async () => {
    const { service, db } = makeService();
    db.query.refreshTokens.findFirst.mockResolvedValue(undefined);
    const err = await rejection(service.refresh({ refreshToken: 'raw' }));
    expect(err.code).toBe(ERROR_CODES.INVALID_REFRESH_TOKEN.code);
  });

  it('revoked reuse (theft) → revokes EVERY token of the user', async () => {
    const { service, db } = makeService();
    db.query.refreshTokens.findFirst.mockResolvedValue({
      ...row,
      revoked: true,
    });
    const err = await rejection(service.refresh({ refreshToken: 'raw' }));
    expect(err.code).toBe(ERROR_CODES.INVALID_REFRESH_TOKEN.code);
    expect(db.update).toHaveBeenCalledWith(refreshTokens);
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ revoked: true });
    // Scope pin: the revoke targets the USER (all their tokens), never just
    // the presented row — revoke-one would silently gut theft detection.
    const where = serializeFragment(chainOf(db.update).where.mock.calls[0][0]);
    expect(where).toContain(row.userId);
    expect(where).not.toContain(row.id);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('expired token → error without revocation', async () => {
    const { service, db } = makeService();
    db.query.refreshTokens.findFirst.mockResolvedValue({
      ...row,
      expiresAt: PAST,
    });
    const err = await rejection(service.refresh({ refreshToken: 'raw' }));
    expect(err.code).toBe(ERROR_CODES.INVALID_REFRESH_TOKEN.code);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('deleted user → INVALID_REFRESH_TOKEN', async () => {
    const { service, db } = makeService();
    db.query.refreshTokens.findFirst.mockResolvedValue(row);
    db.query.users.findFirst.mockResolvedValue(undefined);
    const err = await rejection(service.refresh({ refreshToken: 'raw' }));
    expect(err.code).toBe(ERROR_CODES.INVALID_REFRESH_TOKEN.code);
  });

  it('suspended user → revoke all + FORBIDDEN', async () => {
    const { service, db } = makeService();
    db.query.refreshTokens.findFirst.mockResolvedValue(row);
    db.query.users.findFirst.mockResolvedValue(
      userRow({ id: row.userId, suspendedAt: new Date() }),
    );
    const err = await rejection(service.refresh({ refreshToken: 'raw' }));
    expect(err.code).toBe(ERROR_CODES.FORBIDDEN.code);
    expect(db.update).toHaveBeenCalledWith(refreshTokens);
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ revoked: true });
    const suspendWhere = serializeFragment(chainOf(db.update).where.mock.calls[0][0]);
    expect(suspendWhere).toContain(row.userId);
    expect(suspendWhere).not.toContain(row.id);
  });

  it('success: rotation tx revokes old, inserts new preserving rememberMe', async () => {
    const { service, db, tx } = makeService();
    db.query.refreshTokens.findFirst.mockResolvedValue(row);
    db.query.users.findFirst.mockResolvedValue(userRow({ id: row.userId }));

    const result = await service.refresh({ refreshToken: 'raw' });

    expect(tx.update).toHaveBeenCalledWith(refreshTokens);
    expect(tx.insert).toHaveBeenCalledWith(refreshTokens);
    expect(chainOf(tx.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: row.userId, rememberMe: true }),
    );
    expect(result.refreshToken).not.toBe('raw');
    expect(result.accessToken).toBe('access-token');
    expect(typeof result.refreshExpiresAt).toBe('string');
  });
});

// ── Password reset ───────────────────────────────────────────────────────────

describe('AuthService.resetPassword', () => {
  const validRow = {
    id: 'prt-1',
    userId: '11111111-1111-4111-8111-111111111111',
    tokenHash: 'irrelevant-mock',
    expiresAt: FUTURE,
    used: false,
    createdAt: PAST,
  };

  it.each([
    ['missing', undefined],
    ['used', { ...validRow, used: true }],
    ['expired', { ...validRow, expiresAt: PAST }],
  ])('%s token → INVALID_RESET_TOKEN', async (_label, rowValue) => {
    const { service, db } = makeService();
    db.query.passwordResetTokens.findFirst.mockResolvedValue(rowValue);
    const err = await rejection(
      service.resetPassword({ token: 'raw', newPassword: 'new-pw-123' }),
    );
    expect(err.code).toBe(ERROR_CODES.INVALID_RESET_TOKEN.code);
  });

  it('success: rehashes password and revokes every session in one tx', async () => {
    const { service, db, tx } = makeService();
    db.query.passwordResetTokens.findFirst.mockResolvedValue(validRow);

    const result = await service.resetPassword({
      token: 'raw',
      newPassword: 'new-pw-123',
    });

    expect(result).toEqual({ success: true });
    expect(mockedHash).toHaveBeenCalledWith('new-pw-123', 12);
    expect(tx.update.mock.calls.map((c) => c[0])).toEqual([
      users,
      passwordResetTokens,
      refreshTokens,
    ]);
    expect(chainOf(tx.update, 2).set).toHaveBeenCalledWith({ revoked: true });
    const resetWhere = serializeFragment(chainOf(tx.update, 2).where.mock.calls[0][0]);
    expect(resetWhere).toContain(validRow.userId);
  });
});

describe('AuthService.forgotPassword', () => {
  it('unknown email → success with zero writes and zero mail', async () => {
    const { service, db, mail } = makeService();
    db.query.users.findFirst.mockResolvedValue(undefined);
    const result = await service.forgotPassword({ email: 'nobody@x.z' });
    expect(result).toEqual({ success: true });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('known email: invalidates prior tokens, inserts a new one, mails the link', async () => {
    const { service, db, mail } = makeService({ APP_URL: 'https://app.test' });
    const user = userRow();
    db.query.users.findFirst.mockResolvedValue({
      id: user.id,
      email: user.email,
    });

    const result = await service.forgotPassword({ email: user.email });

    expect(result).toEqual({ success: true });
    expect(db.update).toHaveBeenCalledWith(passwordResetTokens);
    expect(db.insert).toHaveBeenCalledWith(passwordResetTokens);
    expect(mail.sendPasswordReset).toHaveBeenCalledWith(
      user.email,
      expect.stringContaining('https://app.test/reset-password?token='),
    );
  });

  it('mail failure is swallowed — still success (no enumeration leak)', async () => {
    const { service, db, mail } = makeService();
    db.query.users.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    mail.sendPasswordReset.mockRejectedValue(new Error('smtp down'));
    const result = await service.forgotPassword({ email: 'a@b.c' });
    expect(result).toEqual({ success: true });
  });
});

// ── Email verification (OTP path) ────────────────────────────────────────────

describe('AuthService.verifyEmailCode', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  function codeRow(overrides: Record<string, unknown> = {}) {
    const { tokens } = makeService();
    return {
      id: 'evt-1',
      userId,
      tokenHash: 'irrelevant-mock',
      used: false,
      expiresAt: FUTURE,
      codeHash: tokens.hashVerificationCode('999999'), // NOT the submitted code
      codeExpiresAt: FUTURE,
      attempts: 0,
      createdAt: PAST,
      ...overrides,
    };
  }

  it('already verified → idempotent success, no code lookup', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue({
      id: userId,
      emailVerified: true,
    });
    const result = await service.verifyEmailCode({ userId, code: '123456' });
    expect(result).toEqual({ success: true });
    expect(db.query.emailVerificationTokens.findFirst).not.toHaveBeenCalled();
  });

  it('unknown user → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(undefined);
    const err = await rejection(
      service.verifyEmailCode({ userId, code: '123456' }),
    );
    expect(err.code).toBe(ERROR_CODES.NOT_FOUND.code);
  });

  it('no active code → INVALID_VERIFICATION_CODE', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue({
      id: userId,
      emailVerified: false,
    });
    db.query.emailVerificationTokens.findFirst.mockResolvedValue(undefined);
    const err = await rejection(
      service.verifyEmailCode({ userId, code: '123456' }),
    );
    expect(err.code).toBe(ERROR_CODES.INVALID_VERIFICATION_CODE.code);
  });

  it('expired code → INVALID_VERIFICATION_CODE', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue({
      id: userId,
      emailVerified: false,
    });
    db.query.emailVerificationTokens.findFirst.mockResolvedValue(
      codeRow({ codeExpiresAt: PAST }),
    );
    const err = await rejection(
      service.verifyEmailCode({ userId, code: '123456' }),
    );
    expect(err.message).toContain('expired');
  });

  it('attempts at cap → lockout, no further increment', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue({
      id: userId,
      emailVerified: false,
    });
    db.query.emailVerificationTokens.findFirst.mockResolvedValue(
      codeRow({ attempts: 5 }),
    );
    const err = await rejection(
      service.verifyEmailCode({ userId, code: '123456' }),
    );
    expect(err.message).toContain('Too many incorrect attempts');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('wrong code → guarded increment with plural remaining count', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue({
      id: userId,
      emailVerified: false,
    });
    db.query.emailVerificationTokens.findFirst.mockResolvedValue(
      codeRow({ attempts: 2 }),
    );
    db.update.mockImplementationOnce(() => writeChain([{ attempts: 3 }]));

    const err = await rejection(
      service.verifyEmailCode({ userId, code: '123456' }),
    );

    expect(chainOf(db.update).set).toHaveBeenCalledWith({ attempts: 3 });
    // 3rd wrong guess consumed → 2 of 5 remain.
    expect(err.message).toBe('Incorrect code. 2 attempts remaining.');
  });

  it('wrong code at 3 attempts → singular "1 attempt remaining"', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue({
      id: userId,
      emailVerified: false,
    });
    db.query.emailVerificationTokens.findFirst.mockResolvedValue(
      codeRow({ attempts: 3 }),
    );
    db.update.mockImplementationOnce(() => writeChain([{ attempts: 4 }]));

    const err = await rejection(
      service.verifyEmailCode({ userId, code: '123456' }),
    );
    expect(err.message).toBe('Incorrect code. 1 attempt remaining.');
  });

  it('guarded increment lost the race (no row back) → lockout message', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue({
      id: userId,
      emailVerified: false,
    });
    db.query.emailVerificationTokens.findFirst.mockResolvedValue(
      codeRow({ attempts: 0 }),
    );
    // Default chain resolves [] — the guarded update matched nothing.
    const err = await rejection(
      service.verifyEmailCode({ userId, code: '123456' }),
    );
    expect(err.message).toContain('Too many incorrect attempts');
  });

  it('truncated legacy codeHash → treated as a wrong code, no crash', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue({
      id: userId,
      emailVerified: false,
    });
    db.query.emailVerificationTokens.findFirst.mockResolvedValue(
      codeRow({ codeHash: 'deadbeef', attempts: 0 }),
    );
    db.update.mockImplementationOnce(() => writeChain([{ attempts: 1 }]));

    const err = await rejection(
      service.verifyEmailCode({ userId, code: '123456' }),
    );
    expect(err.message).toContain('Incorrect code.');
  });

  it('correct code → tx marks the user verified and the token used', async () => {
    const { service, db, tx } = makeService({ OTP_PEPPER: 'pepper' });
    db.query.users.findFirst.mockResolvedValue({
      id: userId,
      emailVerified: false,
    });
    // codeHash computed with the SAME pepper the (real) TokenService uses.
    const tokens = new TokenService(
      { sign: jest.fn() } as unknown as JwtService,
      configStub({ OTP_PEPPER: 'pepper' }),
    );
    db.query.emailVerificationTokens.findFirst.mockResolvedValue(
      codeRow({ codeHash: tokens.hashVerificationCode('123456') }),
    );

    const result = await service.verifyEmailCode({ userId, code: '123456' });

    expect(result).toEqual({ success: true });
    expect(tx.update.mock.calls.map((c) => c[0])).toEqual([
      users,
      emailVerificationTokens,
    ]);
    expect(chainOf(tx.update, 1).set).toHaveBeenCalledWith({ used: true });
  });
});

// ── Google OAuth ─────────────────────────────────────────────────────────────

describe('AuthService.googleLogin', () => {
  const profile = {
    googleId: 'g-1',
    email: 'g@example.com',
    name: 'Google User',
    avatar: 'https://lh3.googleusercontent.com/avatar.png',
  } as GoogleProfile;

  function withPrimaryWorkspace(db: ReturnType<typeof createDbMock>) {
    db.query.workspaceMembers.findFirst.mockResolvedValue({
      workspace: workspaceRow(),
      role: 'owner',
    });
  }

  it('existing linked account → straight to session, no user writes', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(
      userRow({ email: profile.email, provider: 'google', providerId: 'g-1' }),
    );
    withPrimaryWorkspace(db);

    const result = await service.googleLogin(profile);

    expect(result.user).toMatchObject({ email: profile.email });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledWith(refreshTokens); // startSession
  });

  it('same-email local account → links Google identity', async () => {
    const { service, db } = makeService();
    const local = userRow({ email: profile.email, avatar: null });
    db.query.users.findFirst
      .mockResolvedValueOnce(undefined) // by providerId
      .mockResolvedValueOnce(local); // by email
    db.update.mockImplementationOnce(() =>
      writeChain([
        { ...local, providerId: 'g-1', emailVerified: true, avatar: profile.avatar },
      ]),
    );
    withPrimaryWorkspace(db);

    const result = await service.googleLogin(profile);

    expect(chainOf(db.update).set).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'g-1',
        emailVerified: true,
        avatar: profile.avatar, // local avatar was null → Google's wins
      }),
    );
    expect(result.user.emailVerified).toBe(true);
  });

  it('brand-new Google user → signup tx + free subscription + invite claim', async () => {
    const { service, db, tx, invitations } = makeService();
    const googleUser = userRow({
      email: profile.email,
      name: profile.name,
      provider: 'google',
      providerId: 'g-1',
      emailVerified: true,
    });
    tx.query.plans.findFirst.mockResolvedValue({ id: 'free-plan-id' });
    tx.insert.mockImplementationOnce(() => writeChain([googleUser]))
      .mockImplementationOnce(() => writeChain([workspaceRow()]));
    withPrimaryWorkspace(db);

    const result = await service.googleLogin(profile);

    expect(tx.insert.mock.calls.map((c) => c[0])).toEqual([
      users,
      workspaces,
      workspaceMembers,
      subscriptions,
    ]);
    expect(invitations.claimPending).toHaveBeenCalledWith(
      googleUser.id,
      googleUser.email,
    );
    expect(result.user.email).toBe(profile.email);
  });
});

// ── Profile ──────────────────────────────────────────────────────────────────

describe('AuthService.updateProfile', () => {
  it('null avatar clears it and reports the prior value', async () => {
    const { service, db } = makeService();
    const existing = userRow({ avatar: 'avatars/old/key.png' });
    db.query.users.findFirst.mockResolvedValue(existing);
    db.update.mockImplementationOnce(() =>
      writeChain([{ ...existing, avatar: null }]),
    );

    const result = await service.updateProfile({
      userId: existing.id,
      dto: { avatar: null },
    });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({ avatar: null });
    expect(result.previousAvatarKey).toBe('avatars/old/key.png');
  });

  it('https avatar URL is stored verbatim', async () => {
    const { service, db } = makeService();
    const existing = userRow();
    db.query.users.findFirst.mockResolvedValue(existing);
    db.update.mockImplementationOnce(() =>
      writeChain([{ ...existing, avatar: 'https://x.example/a.png' }]),
    );

    await service.updateProfile({
      userId: existing.id,
      dto: { avatar: 'https://x.example/a.png' },
    });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({
      avatar: 'https://x.example/a.png',
    });
  });

  it('own R2 key prefix is accepted', async () => {
    const { service, db } = makeService();
    const existing = userRow();
    db.query.users.findFirst.mockResolvedValue(existing);
    db.update.mockImplementationOnce(() => writeChain([existing]));

    await service.updateProfile({
      userId: existing.id,
      dto: { avatar: `avatars/${existing.id}/photo.png` },
    });
    expect(chainOf(db.update).set).toHaveBeenCalled();
  });

  it.each([
    'avatars/someone-else/photo.png',
    'photo.png',
    'ftp://x.example/a.png',
  ])('avatar %p → VALIDATION_ERROR', async (avatar) => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(userRow());
    const err = await rejection(
      service.updateProfile({ userId: 'u1', dto: { avatar } }),
    );
    expect(err.code).toBe(ERROR_CODES.VALIDATION_ERROR.code);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('name-only patch → previousAvatarKey null', async () => {
    const { service, db } = makeService();
    const existing = userRow({ avatar: 'avatars/u1/k.png' });
    db.query.users.findFirst.mockResolvedValue(existing);
    db.update.mockImplementationOnce(() =>
      writeChain([{ ...existing, name: 'Renamed' }]),
    );

    const result = await service.updateProfile({
      userId: existing.id,
      dto: { name: 'Renamed' },
    });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({ name: 'Renamed' });
    expect(result.previousAvatarKey).toBeNull();
  });

  it('empty dto → no-op returning the current view', async () => {
    const { service, db } = makeService();
    const existing = userRow();
    db.query.users.findFirst.mockResolvedValue(existing);

    const result = await service.updateProfile({ userId: existing.id, dto: {} });

    expect(db.update).not.toHaveBeenCalled();
    expect(result.previousAvatarKey).toBeNull();
    expect(result.user.email).toBe(existing.email);
  });
});

// ── Logout ───────────────────────────────────────────────────────────────────

describe('AuthService.logout', () => {
  it('revokes the token row by hash', async () => {
    const { service, db } = makeService();
    const result = await service.logout({ refreshToken: 'raw' });
    expect(result).toEqual({ success: true });
    expect(db.update).toHaveBeenCalledWith(refreshTokens);
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ revoked: true });
    // Scope pin: the revoke targets the sha256 of the presented token —
    // never the raw string (it isn't stored), and never a whole user's
    // sessions (that would log the user out of every device).
    const expectedHash = createHash('sha256').update('raw').digest('hex');
    expectScopedWhere(db.update, 0, expectedHash);
    // And the raw token string never appears in the lookup (circular-safe).
    expect(serializeFragment(chainOf(db.update).where.mock.calls[0][0])).not.toContain(
      'raw',
    );
  });
});

// ── Gateway membership validation ────────────────────────────────────────────

describe('AuthService.validateWorkspaceMember', () => {
  it('returns the membership with cascade-resolved permissions', async () => {
    const { service, authz } = makeService();
    authz.resolveRoles.mockResolvedValue({
      workspaceId: 'ws-1',
      projectId: null,
      wsRole: 'admin',
      projRole: null,
      permissions: new Set(['WORKSPACE_VIEW', 'WORKSPACE_MEMBERS_VIEW']),
    });

    const membership = await service.validateWorkspaceMember({
      userId: 'u1',
      workspaceId: 'ws-1',
    });

    expect(membership).toEqual({
      workspaceId: 'ws-1',
      role: 'admin',
      permissions: ['WORKSPACE_VIEW', 'WORKSPACE_MEMBERS_VIEW'],
    });
  });

  it('no workspace role → FORBIDDEN', async () => {
    const { service, authz } = makeService();
    authz.resolveRoles.mockResolvedValue({
      workspaceId: 'ws-1',
      projectId: null,
      wsRole: null,
      projRole: null,
      permissions: new Set(),
    });

    const err = await rejection(
      service.validateWorkspaceMember({ userId: 'u1', workspaceId: 'ws-1' }),
    );
    expect(err.code).toBe(ERROR_CODES.FORBIDDEN.code);
  });
});

describe('AuthService.validateProjectMember — the cascade bypass', () => {
  function roles(overrides: Record<string, unknown>) {
    return {
      workspaceId: 'ws-1',
      projectId: 'p1',
      wsRole: null,
      projRole: null,
      permissions: new Set(['PROJECT_VIEW']),
      ...overrides,
    };
  }

  it('explicit project_members row → access with that role', async () => {
    const { service, authz } = makeService();
    authz.resolveRoles.mockResolvedValue(
      roles({ projRole: 'editor', permissions: new Set(['PROJECT_VIEW', 'PROJECT_EDIT']) }),
    );

    const membership = await service.validateProjectMember({
      userId: 'u1',
      projectId: 'p1',
    });

    expect(membership).toEqual({
      projectId: 'p1',
      workspaceId: 'ws-1',
      role: 'editor',
      permissions: ['PROJECT_VIEW', 'PROJECT_EDIT'],
    });
  });

  it.each(['owner', 'admin'] as const)(
    'workspace %s gets project access with NO project_members row',
    async (wsRole) => {
      const { service, authz } = makeService();
      authz.resolveRoles.mockResolvedValue(roles({ wsRole }));

      const membership = await service.validateProjectMember({
        userId: 'u1',
        projectId: 'p1',
      });

      expect(membership.role).toBeNull(); // no explicit project role
      expect(membership.workspaceId).toBe('ws-1');
    },
  );

  it('plain workspace member without a project row → FORBIDDEN', async () => {
    const { service, authz } = makeService();
    authz.resolveRoles.mockResolvedValue(roles({ wsRole: 'member' }));

    const err = await rejection(
      service.validateProjectMember({ userId: 'u1', projectId: 'p1' }),
    );
    expect(err.code).toBe(ERROR_CODES.FORBIDDEN.code);
  });

  it('no access implies no workspace → NOT_FOUND guard', async () => {
    const { service, authz } = makeService();
    authz.resolveRoles.mockResolvedValue({
      workspaceId: null,
      projectId: 'p1',
      wsRole: null,
      projRole: null,
      permissions: new Set(),
    });

    // Edge order: access check first — a "member" role that somehow carries no
    // workspace would fall through to the NOT_FOUND guard.
    const err = await rejection(
      service.validateProjectMember({ userId: 'u1', projectId: 'p1' }),
    );
    expect([ERROR_CODES.FORBIDDEN.code, ERROR_CODES.NOT_FOUND.code]).toContain(
      err.code,
    );
  });
});

describe('AuthService.verifyEmail — link-token path', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const FUTURE = new Date('2030-01-01T00:00:00.000Z');

  function tokenRow(overrides: Record<string, unknown> = {}) {
    const { tokens } = makeService();
    return {
      id: 'evt-1',
      userId,
      tokenHash: tokens.hash('raw-token'),
      used: false,
      expiresAt: FUTURE,
      codeHash: 'x',
      codeExpiresAt: FUTURE,
      attempts: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  it.each([
    ['unknown token', undefined],
    ['already used', tokenRow({ used: true })],
    ['expired', tokenRow({ expiresAt: new Date('2026-01-01T00:00:00.000Z') })],
  ])('%s → INVALID_VERIFICATION_TOKEN, no write', async (_name, row) => {
    const { service, db } = makeService();
    db.query.emailVerificationTokens.findFirst.mockResolvedValue(row);

    const err = await rejection(service.verifyEmail({ token: 'raw-token' }));
    expect(err.code).toBe(ERROR_CODES.INVALID_VERIFICATION_TOKEN.code);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('the lookup is by the sha256 of the presented token — never the raw string', async () => {
    const { service, db, tokens } = makeService();
    db.query.emailVerificationTokens.findFirst.mockResolvedValue(tokenRow());

    await service.verifyEmail({ token: 'raw-token' });

    const lookupWhere = serializeFragment(
      db.query.emailVerificationTokens.findFirst.mock.calls[0][0].where,
    );
    expect(lookupWhere).toContain(tokens.hash('raw-token'));
    expect(lookupWhere).not.toContain('raw-token');
  });

  it('valid token → user marked verified and the token burned, in one tx', async () => {
    const { service, db } = makeService();
    const row = tokenRow();
    db.query.emailVerificationTokens.findFirst.mockResolvedValue(row);

    const result = await service.verifyEmail({ token: 'raw-token' });

    expect(result).toEqual({ success: true });
    expect(db.__tx.update).toHaveBeenNthCalledWith(1, users);
    expect(chainOf(db.__tx.update, 0).set).toHaveBeenCalledWith({
      emailVerified: true,
    });
    expect(serializeFragment(chainOf(db.__tx.update, 0).where.mock.calls[0][0])).toContain(
      userId,
    );
    expect(db.__tx.update).toHaveBeenNthCalledWith(2, emailVerificationTokens);
    expect(chainOf(db.__tx.update, 1).set).toHaveBeenCalledWith({ used: true });
    // Burn exactly THIS token row.
    expect(serializeFragment(chainOf(db.__tx.update, 1).where.mock.calls[0][0])).toContain(
      'evt-1',
    );
  });
});

describe('AuthService.resendVerification', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  it('unknown user → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(undefined);
    const err = await rejection(service.resendVerification({ userId }));
    expect(err.code).toBe(ERROR_CODES.NOT_FOUND.code);
  });

  it('already verified → success with NO mail (no enumeration via resend)', async () => {
    const { service, db, mail } = makeService();
    db.query.users.findFirst.mockResolvedValue({ id: userId, emailVerified: true });

    const result = await service.resendVerification({ userId });

    expect(result).toEqual({ success: true });
    expect(mail.sendVerification).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('unverified → prior unused tokens invalidated, fresh token+code issued, mail sent', async () => {
    const { service, db, tokens, mail } = makeService(
      { EMAIL_VERIFY_TTL: '24h', OTP_TTL: '10m' },
    );
    db.query.users.findFirst.mockResolvedValue({
      id: userId,
      email: 'u@x.y',
      emailVerified: false,
    });

    const result = await service.resendVerification({ userId });

    expect(result).toEqual({ success: true });
    // 1. Old unused tokens burned for THIS user only.
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ used: true });
    const invalidateWhere = serializeFragment(chainOf(db.update).where.mock.calls[0][0]);
    expect(invalidateWhere).toContain(userId);
    // 2. New row: opaque token hash + code hash, distinct TTLs.
    const values = chainOf(db.insert).values.mock.calls[0][0] as Record<string, unknown>;
    expect(values.tokenHash).toEqual(expect.any(String));
    expect(values.tokenHash).not.toContain('raw');
    expect(values.codeHash).toEqual(expect.any(String));
    expect(values.expiresAt.getTime()).toBeGreaterThan(values.codeExpiresAt.getTime());
    // 3. Mail dispatched with the verify link.
    expect(mail.sendVerification).toHaveBeenCalledWith(
      'u@x.y',
      expect.stringContaining('/verify-email?token='),
      expect.any(String),
    );
  });

  it('a mail failure never fails the resend (logged, swallowed)', async () => {
    const { service, db, mail } = makeService();
    db.query.users.findFirst.mockResolvedValue({
      id: userId,
      email: 'u@x.y',
      emailVerified: false,
    });
    mail.sendVerification.mockRejectedValue(new Error('SMTP down'));

    await expect(service.resendVerification({ userId })).resolves.toEqual({
      success: true,
    });
  });
});
