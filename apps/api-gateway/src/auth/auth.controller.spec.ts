import { of } from 'rxjs';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { setEnv } from '../testing/env';

const MINUTE = 60_000;

function authResult() {
  return {
    user: { id: 'u1', email: 'a@b.c' },
    workspace: { id: 'ws-1' },
    accessToken: 'access-tok',
    refreshToken: 'refresh-tok',
    refreshExpiresAt: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
  };
}

function makeController() {
  const result = authResult(); // fixed per controller — Date.now() must not drift
  const send = jest.fn(() => of(result));
  const auth = { send } as never;
  const res = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  } as unknown as Response & { cookie: jest.Mock; clearCookie: jest.Mock; redirect: jest.Mock };
  return { controller: new AuthController(auth), send, res, result };
}

function cookieCalls(res: { cookie: jest.Mock }) {
  return res.cookie.mock.calls as Array<[string, string, Record<string, unknown>]>;
}

afterEach(() => {
  delete process.env.NODE_ENV;
  delete process.env.CLIENT_ORIGIN;
});

describe('AuthController — session cookie mechanics', () => {
  it('login sets all three cookies with the right flags and paths', async () => {
    const { controller, res, result } = makeController();

    const body = await controller.login({ email: 'a@b.c', password: 'pw' }, res);

    const calls = cookieCalls(res);
    expect(calls.map((c) => c[0])).toEqual(['refresh_token', 'access_token', 'csrf_token']);

    const [refreshName, refreshToken, refreshOpts] = calls[0];
    expect(refreshName).toBe('refresh_token');
    expect(refreshToken).toBe('refresh-tok');
    expect(refreshOpts).toMatchObject({
      httpOnly: true,
      secure: false, // dev
      sameSite: 'lax',
      path: '/v1/auth', // refresh is ONLY sent to auth routes
    });
    expect(refreshOpts.expires).toEqual(new Date(result.refreshExpiresAt));

    const [, accessToken, accessOpts] = calls[1];
    expect(accessToken).toBe('access-tok');
    expect(accessOpts).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/v1',
      maxAge: 15 * MINUTE,
    });

    const [, csrfToken, csrfOpts] = calls[2];
    expect(csrfToken).toMatch(/^[0-9a-f]{64}$/); // randomBytes(32) mint
    expect(csrfOpts).toMatchObject({ httpOnly: true, path: '/v1', maxAge: 15 * MINUTE });

    // Double-submit pairing: the body token IS the cookie token.
    expect(body.csrfToken).toBe(csrfToken);
  });

  it('production flips every cookie to secure', async () => {
    setEnv({ NODE_ENV: 'production' });
    const { controller, res } = makeController();

    await controller.login({ email: 'a@b.c', password: 'pw' }, res);

    for (const call of cookieCalls(res)) {
      expect(call[2]).toMatchObject({ secure: true });
    }
  });
});

describe('AuthController.refresh', () => {
  it('missing refresh cookie → INVALID_REFRESH_TOKEN, no cookies touched', async () => {
    const { controller, res, send } = makeController();

    await expect(controller.refresh({ cookies: {} } as never, res)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
      message: expect.stringContaining('No refresh token'),
    });
    expect(send).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('valid refresh rotates cookies and re-pairs the CSRF token', async () => {
    const { controller, res, send } = makeController();

    const body = await controller.refresh(
      { cookies: { refresh_token: 'old-refresh' } } as never,
      res,
    );

    expect(send).toHaveBeenCalledWith(expect.anything(), { refreshToken: 'old-refresh' });
    expect(cookieCalls(res)).toHaveLength(3); // rotated refresh + new access + new CSRF
    const csrfCookie = cookieCalls(res)[2];
    expect(body.csrfToken).toBe(csrfCookie[1]);
  });
});

describe('AuthController.logout', () => {
  it('clears all three cookies on their exact paths, even with no token present', async () => {
    const { controller, res, send } = makeController();

    await controller.logout({ cookies: {} } as never, res);

    expect(send).not.toHaveBeenCalled(); // nothing to revoke
    const clears = res.clearCookie.mock.calls as Array<[string, Record<string, unknown>]>;
    expect(clears).toEqual([
      ['refresh_token', { path: '/v1/auth' }],
      ['access_token', { path: '/v1' }],
      ['csrf_token', { path: '/v1' }],
    ]);
  });

  it('with a token: revokes downstream first, then clears', async () => {
    const { controller, res, send } = makeController();

    await controller.logout({ cookies: { refresh_token: 'tok' } } as never, res);

    expect(send).toHaveBeenCalledWith(expect.anything(), { refreshToken: 'tok' });
    expect(res.clearCookie).toHaveBeenCalledTimes(3);
  });
});

describe('AuthController.me / googleCallback', () => {
  it('me returns the session plus the ambient CSRF token from the cookie', async () => {
    const { controller, send } = makeController();
    send.mockReturnValue(of({ user: { id: 'u1' }, emailVerified: true }) as never);

    const body = await controller.me(
      { userId: 'u1' } as never,
      { cookies: { csrf_token: 'ambient-csrf' } } as never,
    );

    expect(body).toEqual({ user: { id: 'u1' }, emailVerified: true, csrfToken: 'ambient-csrf' });
  });

  it('googleCallback sets cookies then redirects to a CLEAN url (no token fragment)', async () => {
    const { controller, res } = makeController();

    await controller.googleCallback(
      { user: { providerId: 'g-1' } } as never,
      res as never,
    );

    expect(cookieCalls(res)).toHaveLength(3);
    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/auth/callback');
  });

  it('googleCallback honors CLIENT_ORIGIN when set', async () => {
    setEnv({ CLIENT_ORIGIN: 'https://app.wriven.tech' });
    const { controller, res } = makeController();

    await controller.googleCallback({ user: { providerId: 'g-1' } } as never, res as never);

    expect(res.redirect).toHaveBeenCalledWith('https://app.wriven.tech/auth/callback');
  });
});
