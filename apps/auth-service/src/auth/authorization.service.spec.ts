import { effectivePermissions, Permission } from '@wriven/contracts';
import { AuthorizationService } from './authorization.service';
import { asDb, createDbMock } from '../testing/drizzle-mock';

function makeService() {
  const db = createDbMock();
  const service = new AuthorizationService(asDb(db));
  return { service, db };
}

describe('AuthorizationService.resolveRoles', () => {
  it('project scope: walks project → both memberships → cascade', async () => {
    const { service, db } = makeService();
    db.query.projects.findFirst.mockResolvedValue({ workspaceId: 'ws-1' });
    db.query.projectMembers.findFirst.mockResolvedValue({ role: 'editor' });
    db.query.workspaceMembers.findFirst.mockResolvedValue({ role: 'member' });

    const roles = await service.resolveRoles('u1', { projectId: 'p1' });

    expect(roles).toMatchObject({
      workspaceId: 'ws-1',
      projectId: 'p1',
      wsRole: 'member',
      projRole: 'editor',
    });
    // The cascade math itself lives in @wriven/contracts — same definition the
    // frontend useCan() shares. Assert against the real function, not a copy.
    expect(roles.permissions).toEqual(effectivePermissions('member', 'editor'));
  });

  it('soft-deleted or missing project → no roles, empty permission set', async () => {
    const { service, db } = makeService();
    db.query.projects.findFirst.mockResolvedValue(undefined);

    const roles = await service.resolveRoles('u1', { projectId: 'p1' });

    expect(roles).toMatchObject({
      workspaceId: null,
      wsRole: null,
      projRole: null,
    });
    expect(roles.permissions.size).toBe(0);
  });

  it('workspace-only scope resolves the workspace role', async () => {
    const { service, db } = makeService();
    db.query.workspaceMembers.findFirst.mockResolvedValue({ role: 'owner' });

    const roles = await service.resolveRoles('u1', { workspaceId: 'ws-1' });

    expect(roles).toMatchObject({
      workspaceId: 'ws-1',
      projectId: null,
      wsRole: 'owner',
      projRole: null,
    });
    expect(roles.permissions).toEqual(effectivePermissions('owner', null));
  });

  it('non-member → null roles and an empty permission set', async () => {
    const { service, db } = makeService();
    db.query.workspaceMembers.findFirst.mockResolvedValue(undefined);

    const roles = await service.resolveRoles('u1', { workspaceId: 'ws-1' });

    expect(roles.wsRole).toBeNull();
    expect(roles.permissions.size).toBe(0);
  });
});

describe('AuthorizationService.authorize / can', () => {
  function ownerService() {
    const { service, db } = makeService();
    db.query.workspaceMembers.findFirst.mockResolvedValue({ role: 'owner' });
    return { service, db };
  }

  it('authorize passes when the resolved set contains the permission', async () => {
    const { service } = ownerService();
    const roles = await service.resolveRoles('u1', { workspaceId: 'ws-1' });
    const permission = [...roles.permissions][0] as Permission;

    const resolved = await service.authorize({
      userId: 'u1',
      permission,
      workspaceId: 'ws-1',
    });
    expect(resolved.wsRole).toBe('owner');
  });

  it('authorize throws FORBIDDEN when the set is empty', async () => {
    const { service, db } = makeService();
    db.query.workspaceMembers.findFirst.mockResolvedValue(undefined);

    await expect(
      service.authorize({
        userId: 'u1',
        permission: 'WORKSPACE_MEMBERS_MANAGE' as Permission,
        workspaceId: 'ws-1',
      }),
    ).rejects.toThrow('You do not have permission');
  });

  it('authorize throws FORBIDDEN against a NON-empty set that lacks the permission', async () => {
    // Non-tautological negative: a member resolves a real permission set, but
    // WORKSPACE_MEMBERS_MANAGE is owner/admin-only — containment must reject.
    const { service, db } = makeService();
    db.query.workspaceMembers.findFirst.mockResolvedValue({ role: 'member' });

    await expect(
      service.authorize({
        userId: 'u1',
        permission: Permission.WORKSPACE_MEMBERS_MANAGE,
        workspaceId: 'ws-1',
      }),
    ).rejects.toThrow('You do not have permission');

    // And the boolean mirror says false, not throw.
    await expect(
      service.can({
        userId: 'u1',
        permission: Permission.WORKSPACE_MEMBERS_MANAGE,
        workspaceId: 'ws-1',
      }),
    ).resolves.toBe(false);
  });

  it('can() returns the boolean without throwing', async () => {
    const owner = ownerService();
    const roles = await owner.service.resolveRoles('u1', { workspaceId: 'ws-1' });
    const permission = [...roles.permissions][0] as Permission;

    expect(
      await owner.service.can({
        userId: 'u1',
        permission,
        workspaceId: 'ws-1',
      }),
    ).toBe(true);

    const { service, db } = makeService();
    db.query.workspaceMembers.findFirst.mockResolvedValue(undefined);
    expect(
      await service.can({
        userId: 'u1',
        permission,
        workspaceId: 'ws-1',
      }),
    ).toBe(false);
  });
});
