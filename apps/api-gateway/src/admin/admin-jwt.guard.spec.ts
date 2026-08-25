import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES } from '@wriven/contracts';
import { AdminJwtGuard } from './admin-jwt.guard';
import { configStub } from '../testing/config-stub';
import { httpContext, serviceErrorThrown } from '../testing/http';

const SECRET = 'admin-test-secret';

function makeGuard(secret = SECRET) {
  return new AdminJwtGuard(configStub({ ADMIN_JWT_SECRET: secret }));
}

/** Mint a real HS256 admin token with the guard's own secret. */
function sign(payload: Record<string, unknown>, secret = SECRET): string {
  return new JwtService({ secret }).sign(payload as never);
}

describe('AdminJwtGuard', () => {
  it('missing admin cookie → UNAUTHORIZED', () => {
    const err = serviceErrorThrown(() =>
      makeGuard().canActivate(httpContext({ cookies: {} })),
    );
    expect(err.code).toBe(ERROR_CODES.UNAUTHORIZED.code);
  });

  it('valid admin-typed token → req.adminUser pinned', () => {
    const guard = makeGuard();
    const req: Record<string, unknown> = {
      cookies: {
        admin_access_token: sign({
          sub: 'admin-1',
          email: 'ops@wriven.dev',
          role: 'admin',
          typ: 'admin',
        }),
      },
    };

    expect(guard.canActivate(httpContext(req))).toBe(true);
    expect(req.adminUser).toEqual({
      adminUserId: 'admin-1',
      email: 'ops@wriven.dev',
      role: 'admin',
    });
  });

  it('token signed with the TENANT secret → rejected (secret separation)', () => {
    const guard = makeGuard();
    const tenantSigned = sign({ sub: 'x', typ: 'admin', role: 'admin' }, 'tenant-secret');
    const err = serviceErrorThrown(() =>
      guard.canActivate(
        httpContext({ cookies: { admin_access_token: tenantSigned } }),
      ),
    );
    expect(err.code).toBe(ERROR_CODES.UNAUTHORIZED.code);
    expect(err.message).toContain('invalid or expired');
  });

  it.each([
    ['missing typ', { sub: 'a', role: 'admin' }],
    ['non-admin typ', { sub: 'a', role: 'admin', typ: 'tenant' }],
    ['missing role', { sub: 'a', typ: 'admin' }],
  ])('%s → "Not an admin token" (defence-in-depth)', (_label, payload) => {
    const err = serviceErrorThrown(() =>
      makeGuard().canActivate(
        httpContext({ cookies: { admin_access_token: sign(payload) } }),
      ),
    );
    expect(err.code).toBe(ERROR_CODES.UNAUTHORIZED.code);
    expect(err.message).toBe('Not an admin token.');
  });
});
