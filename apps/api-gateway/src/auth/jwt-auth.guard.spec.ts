import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES } from '@wriven/contracts';
import { JwtAuthGuard } from './jwt-auth.guard';
import { httpContext, serviceErrorThrown } from '../testing/http';

function makeGuard(verify: jest.Mock = jest.fn()) {
  const jwt = { verify } as unknown as JwtService;
  return new JwtAuthGuard(jwt);
}

describe('JwtAuthGuard', () => {
  it('missing access cookie → UNAUTHORIZED', () => {
    const guard = makeGuard();
    const err = serviceErrorThrown(() =>
      guard.canActivate(httpContext({ cookies: {} })),
    );
    expect(err).toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED.code,
      statusCode: ERROR_CODES.UNAUTHORIZED.statusCode,
    });
    expect(err.message).toContain('Missing access token');
  });

  it('valid token → req.user pinned from the payload', () => {
    const verify = jest.fn(() => ({ sub: 'u1', email: 'a@b.c' }));
    const guard = makeGuard(verify);
    const req: Record<string, unknown> = { cookies: { access_token: 'tok' } };

    expect(guard.canActivate(httpContext(req))).toBe(true);
    expect(verify).toHaveBeenCalledWith('tok');
    expect(req.user).toEqual({ userId: 'u1', email: 'a@b.c' });
  });

  it('verify rejection → UNAUTHORIZED invalid/expired', () => {
    const guard = makeGuard(jest.fn(() => { throw new Error('jwt expired'); }));
    const err = serviceErrorThrown(() =>
      guard.canActivate(httpContext({ cookies: { access_token: 'stale' } })),
    );
    expect(err.code).toBe(ERROR_CODES.UNAUTHORIZED.code);
    expect(err.message).toContain('invalid or expired');
  });

  it('missing cookies object behaves as no-cookie (optional chaining)', () => {
    const guard = makeGuard();
    const err = serviceErrorThrown(() => guard.canActivate(httpContext({})));
    expect(err.code).toBe(ERROR_CODES.UNAUTHORIZED.code);
  });
});
