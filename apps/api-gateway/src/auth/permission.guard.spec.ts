import { Reflector } from '@nestjs/core';
import { Permission } from '@wriven/contracts';
import { PermissionGuard } from './permission.guard';
import { httpContext, serviceErrorThrown } from '../testing/http';

function makeGuard(required?: Permission[]) {
  const reflector = new Reflector();
  if (required !== undefined) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  } else {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
  }
  return { guard: new PermissionGuard(reflector), reflector };
}

describe('PermissionGuard', () => {
  it('no @RequirePermission metadata → allow', () => {
    const { guard } = makeGuard();
    expect(guard.canActivate(httpContext({}))).toBe(true);
  });

  it('empty metadata array → allow', () => {
    const { guard } = makeGuard([]);
    expect(guard.canActivate(httpContext({}))).toBe(true);
  });

  it('holds ANY one of the required permissions → allow', () => {
    const { guard } = makeGuard([
      Permission.WORKSPACE_MEMBERS_MANAGE,
      Permission.WORKSPACE_ROLE_ASSIGN,
    ]);
    const req = {
      workspacePermissions: new Set([Permission.WORKSPACE_MEMBERS_MANAGE]),
    };
    expect(guard.canActivate(httpContext(req))).toBe(true);
  });

  it('no permission set on the request → FORBIDDEN', () => {
    const { guard } = makeGuard([Permission.WORKSPACE_MEMBERS_MANAGE]);
    const err = serviceErrorThrown(() => guard.canActivate(httpContext({})));
    expect(err.code).toBe('FORBIDDEN');
  });

  it('projectPermissions take precedence over workspacePermissions', () => {
    const { guard } = makeGuard([Permission.CONTENT_ENTRY_PUBLISH]);
    const req = {
      // Workspace side HAS it, project side doesn't → the project scope wins.
      workspacePermissions: new Set([Permission.CONTENT_ENTRY_PUBLISH]),
      projectPermissions: new Set([Permission.PROJECT_VIEW]),
    };
    const err = serviceErrorThrown(() => guard.canActivate(httpContext(req)));
    expect(err.code).toBe('FORBIDDEN');
  });
});
