import { ERROR_CODES } from '@wriven/contracts';
import { AdminRolesGuard } from './admin-roles.guard';
import { httpContext, serviceErrorThrown } from '../testing/http';

function makeGuard(roles?: string[]) {
  const reflector = { getAllAndOverride: jest.fn(() => roles) } as never;
  return new AdminRolesGuard(reflector);
}

describe('AdminRolesGuard — server-side admin RBAC', () => {
  it('no @AdminRoles metadata → any authenticated admin passes (read-only routes)', () => {
    const guard = makeGuard(undefined);
    expect(
      guard.canActivate(httpContext({ adminUser: { role: 'member' } })),
    ).toBe(true);
  });

  it('role in the allowed set → passes (handler level)', () => {
    const guard = makeGuard(['super_admin', 'admin']);
    expect(
      guard.canActivate(httpContext({ adminUser: { role: 'admin' } })),
    ).toBe(true);
  });

  it('role NOT in the set → FORBIDDEN', () => {
    const guard = makeGuard(['super_admin']);
    const err = serviceErrorThrown(() =>
      guard.canActivate(httpContext({ adminUser: { role: 'admin' } })),
    );
    expect(err).toMatchObject({ code: ERROR_CODES.FORBIDDEN.code });
    expect(err.message).toContain('does not permit');
  });

  it('missing admin identity (guard ordering bug) → FORBIDDEN, never a pass', () => {
    const guard = makeGuard(['admin']);
    const err = serviceErrorThrown(() => guard.canActivate(httpContext({})));
    expect(err.code).toBe(ERROR_CODES.FORBIDDEN.code);
  });
});
