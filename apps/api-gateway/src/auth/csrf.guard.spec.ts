import { ERROR_CODES } from '@wriven/contracts';
import { CsrfGuard } from './csrf.guard';
import { httpContext, serviceErrorThrown } from '../testing/http';

const guard = new CsrfGuard();

function req(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    path: '/v1/content/entries',
    headers: {},
    cookies: { access_token: 'at', csrf_token: 'csrf-1' },
    ...overrides,
  };
}

describe('CsrfGuard — general surface', () => {
  it('non-mutating methods are never checked', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(guard.canActivate(httpContext(req({ method })))).toBe(true);
    }
  });

  it('bootstrap auth paths are exempt even with a stale access cookie', () => {
    expect(
      guard.canActivate(httpContext(req({ path: '/v1/auth/login' }))),
    ).toBe(true);
    expect(
      guard.canActivate(httpContext(req({ path: '/v1/auth/register' }))),
    ).toBe(true);
  });

  it('mutating request without an access cookie → allow (nothing to forge)', () => {
    expect(
      guard.canActivate(httpContext(req({ cookies: {} }))),
    ).toBe(true);
  });

  it('double-submit match → allow', () => {
    expect(
      guard.canActivate(
        httpContext(req({ headers: { 'x-csrf-token': 'csrf-1' } })),
      ),
    ).toBe(true);
  });

  it.each([
    ['mismatched header', { 'x-csrf-token': 'csrf-2' }],
    ['missing header', {}],
  ])('%s → FORBIDDEN', (_label, headers) => {
    const err = serviceErrorThrown(() =>
      guard.canActivate(httpContext(req({ headers }))),
    );
    expect(err).toMatchObject({
      code: ERROR_CODES.FORBIDDEN.code,
      message: 'Invalid or missing CSRF token.',
    });
  });
});

describe('CsrfGuard — admin surface', () => {
  it('admin bootstrap paths are exempt', () => {
    expect(
      guard.canActivate(
        httpContext(req({ path: '/v1/admin/auth/login', cookies: {} })),
      ),
    ).toBe(true);
  });

  it('admin request without an admin access cookie → allow (guard rejects later)', () => {
    expect(
      guard.canActivate(httpContext(req({ path: '/v1/admin/users' }))),
    ).toBe(true); // tenant cookies present but irrelevant; no admin_access_token
  });

  it('admin cookie pair match → allow; mismatch → FORBIDDEN', () => {
    const base = {
      path: '/v1/admin/users',
      headers: { 'x-csrf-token': 'admin-csrf' },
      cookies: {
        admin_access_token: 'aat',
        admin_csrf_token: 'admin-csrf',
      },
    };
    expect(guard.canActivate(httpContext(req(base)))).toBe(true);

    const err = serviceErrorThrown(() =>
      guard.canActivate(
        httpContext(
          req({ ...base, headers: { 'x-csrf-token': 'wrong' } }),
        ),
      ),
    );
    expect(err.code).toBe(ERROR_CODES.FORBIDDEN.code);
  });
});
