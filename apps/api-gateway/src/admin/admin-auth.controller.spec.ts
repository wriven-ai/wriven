import { of } from 'rxjs';
import * as contracts from '@wriven/contracts';
import { AdminAuthController } from './admin-auth.controller';

/**
 * Admin cookie mechanics — mirror of the tenant AuthController spec, with the
 * admin deltas pinned: SameSite=None+Secure in production (the admin SPA is
 * cross-origin to the API host), refresh cookie scoped to /v1/admin/auth only,
 * and the triple-clear on logout.
 */

function adminResult() {
  return {
    admin: { adminUserId: 'a-1', email: 'staff@wriven.tech', role: 'admin' },
    accessToken: 'at',
    refreshToken: 'rt',
    refreshExpiresAt: '2026-01-22T10:00:00.000Z',
  };
}

function makeController() {
  const send = jest.fn(() => of(adminResult()));
  const auth = { send } as never;
  const controller = new AdminAuthController(auth);
  const res = { cookie: jest.fn(), clearCookie: jest.fn() } as never;
  return { controller, send, res };
}

const cookieCalls = (res: { cookie: jest.Mock }) => res.cookie.mock.calls;
const clearCalls = (res: { clearCookie: jest.Mock }) => res.clearCookie.mock.calls;

const ENV_BACKUP = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = ENV_BACKUP;
});

describe('AdminAuthController.login — cookie flags (dev)', () => {
  it('sets all three cookies; refresh is admin-auth-path-scoped only', async () => {
    process.env.NODE_ENV = 'development';
    const { controller, res } = makeController();

    const body = await controller.login({ email: 's@w.t', password: 'pw' } as never, res);

    const calls = cookieCalls(res);
    expect(calls.map((c) => c[0])).toEqual([
      'admin_refresh_token',
      'admin_access_token',
      'admin_csrf_token',
    ]);

    const [refreshName, refreshToken, refreshOpts] = calls[0];
    expect(refreshName).toBe('admin_refresh_token');
    expect(refreshToken).toBe('rt');
    expect(refreshOpts).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax', // dev
      path: '/v1/admin/auth', // refresh NEVER travels to other admin routes
    });
    expect(refreshOpts.expires).toEqual(new Date('2026-01-22T10:00:00.000Z'));

    const [, accessToken, accessOpts] = calls[1];
    expect(accessToken).toBe('at');
    expect(accessOpts).toMatchObject({
      httpOnly: true,
      path: '/v1/admin',
      maxAge: 15 * 60_000,
    });

    // CSRF cookie pairs with the body token (double-submit).
    const [, csrfCookie, csrfOpts] = calls[2];
    expect(csrfCookie).toBe(body.csrfToken);
    expect(csrfOpts.httpOnly).toBe(true);
    expect(body.admin.adminUserId).toBe('a-1');
  });
});

describe('AdminAuthController.login — production flips SameSite=None + Secure', () => {
  it('a different origin (the admin host) must be able to send these cookies', async () => {
    process.env.NODE_ENV = 'production';
    const { controller, res } = makeController();

    await controller.login({ email: 's@w.t', password: 'pw' } as never, res);

    for (const [, , opts] of cookieCalls(res)) {
      expect(opts).toMatchObject({ secure: true, sameSite: 'none' });
    }
  });
});

describe('AdminAuthController.refresh', () => {
  it('no refresh cookie → INVALID_REFRESH_TOKEN before any auth call', async () => {
    const { controller, send } = makeController();
    const req = { cookies: {} };

    await expect(controller.refresh(req as never, {} as never)).rejects.toMatchObject(
      { code: contracts.ERROR_CODES.INVALID_REFRESH_TOKEN.code },
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('valid cookie → rotates cookies and returns a fresh CSRF pair', async () => {
    process.env.NODE_ENV = 'development';
    const { controller, send, res } = makeController();
    const req = { cookies: { admin_refresh_token: 'rt' } };

    const body = await controller.refresh(req as never, res as never);

    expect(send).toHaveBeenCalledWith(contracts.ADMIN_PATTERNS.REFRESH, {
      refreshToken: 'rt',
    });
    expect(cookieCalls(res)).toHaveLength(3);
    expect(typeof body.csrfToken).toBe('string');
  });
});

describe('AdminAuthController.logout', () => {
  it('revokes server-side and clears all three cookies on their exact paths', async () => {
    const { controller, send, res } = makeController();
    const req = { cookies: { admin_refresh_token: 'rt' } };

    const out = await controller.logout(req as never, res as never);

    expect(send).toHaveBeenCalledWith(contracts.ADMIN_PATTERNS.LOGOUT, {
      refreshToken: 'rt',
    });
    expect(out).toEqual({ success: true });
    expect(clearCalls(res).map((c) => [c[0], c[1].path])).toEqual([
      ['admin_refresh_token', '/v1/admin/auth'],
      ['admin_access_token', '/v1/admin'],
      ['admin_csrf_token', '/v1/admin'],
    ]);
  });

  it('no cookie → still clears, never calls auth with garbage', async () => {
    const { controller, send, res } = makeController();
    const req = { cookies: {} };

    await controller.logout(req as never, res as never);

    expect(send).not.toHaveBeenCalled();
    expect(clearCalls(res)).toHaveLength(3);
  });
});
