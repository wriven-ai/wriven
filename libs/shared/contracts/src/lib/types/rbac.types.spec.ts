import {
  Permission,
  PROJECT_ROLE_PERMISSIONS,
  ProjectRole,
  WORKSPACE_ROLE_PERMISSIONS,
  WorkspaceRole,
  effectivePermissions,
  getProjectScope,
} from './rbac.types';

const perms = (list: Permission[]): Set<Permission> => new Set(list);

const ALL_PROJECT_ACTIONS = perms([
  Permission.PROJECT_VIEW,
  Permission.PROJECT_VIEW_ALL,
  Permission.PROJECT_EDIT,
  Permission.PROJECT_DELETE,
  Permission.PROJECT_MEMBERS_VIEW,
  Permission.PROJECT_MEMBERS_MANAGE,
  Permission.PROJECT_ROLE_ASSIGN,
  Permission.CONTENT_TYPE_MANAGE,
  Permission.CONTENT_ENTRY_CREATE,
  Permission.CONTENT_ENTRY_UPDATE,
  Permission.CONTENT_ENTRY_PUBLISH,
  Permission.CONTENT_ENTRY_DELETE,
  Permission.AI_GENERATE,
  Permission.MEDIA_MANAGE,
  Permission.WEBHOOK_MANAGE,
  Permission.API_KEY_MANAGE,
]);

/** Every permission in the system — the owner set must be exactly this. */
const EVERYTHING = perms(Object.values(Permission));

describe('effectivePermissions — workspace roles alone', () => {
  it('no roles → empty set', () => {
    expect(effectivePermissions(null, null)).toEqual(perms([]));
    expect(effectivePermissions(undefined, undefined).size).toBe(0);
  });

  it('owner → every permission in the system', () => {
    expect(effectivePermissions('owner')).toEqual(EVERYTHING);
    // Owner-only checks, called out explicitly so a map regression is loud.
    expect(effectivePermissions('owner')).toContain(Permission.WORKSPACE_DELETE);
    expect(effectivePermissions('owner')).toContain(
      Permission.WORKSPACE_ROLE_ASSIGN,
    );
  });

  it('admin → everything except the owner-only pair and the guest scope marker', () => {
    const admin = effectivePermissions('admin');
    // PROJECT_VIEW_ASSIGNED is guest-only scope metadata; admin scope is ALL
    // (derived via getProjectScope), so it's deliberately absent from the set.
    const expected = perms([...EVERYTHING].filter(
      (p) =>
        p !== Permission.WORKSPACE_DELETE &&
        p !== Permission.WORKSPACE_ROLE_ASSIGN &&
        p !== Permission.PROJECT_VIEW_ASSIGNED,
    ));
    expect(admin).toEqual(expected);
    expect(admin).toContain(Permission.WORKSPACE_BILLING_MANAGE);
    expect(admin).toContain(Permission.CONTENT_ENTRY_PUBLISH);
    expect(admin).not.toContain(Permission.WORKSPACE_DELETE);
  });

  it('member → view-only at workspace level + see-all marker', () => {
    expect(effectivePermissions('member')).toEqual(
      perms([
        Permission.WORKSPACE_VIEW,
        Permission.WORKSPACE_MEMBERS_VIEW,
        Permission.WORKSPACE_LOGS_VIEW,
        Permission.PROJECT_VIEW,
        Permission.PROJECT_VIEW_ALL,
      ]),
    );
    expect(effectivePermissions('member')).not.toContain(
      Permission.WORKSPACE_EDIT,
    );
    expect(effectivePermissions('member')).not.toContain(Permission.PROJECT_EDIT);
  });

  it('guest → exactly the two assigned-scope markers', () => {
    expect(effectivePermissions('guest')).toEqual(
      perms([Permission.PROJECT_VIEW, Permission.PROJECT_VIEW_ASSIGNED]),
    );
    expect(effectivePermissions('guest')).not.toContain(
      Permission.PROJECT_VIEW_ALL,
    );
  });
});

describe('effectivePermissions — project roles alone (no workspace membership)', () => {
  it('project admin → full project control, zero workspace permissions', () => {
    const expected = perms([...ALL_PROJECT_ACTIONS].filter(
      (p) => p !== Permission.PROJECT_VIEW_ALL,
    ));
    expect(effectivePermissions(null, 'admin')).toEqual(expected);
    expect(effectivePermissions(null, 'admin')).not.toContain(
      Permission.WORKSPACE_VIEW,
    );
  });

  it('editor → create/update content + AI + media, no publish/delete/manage', () => {
    expect(effectivePermissions(null, 'editor')).toEqual(
      perms([
        Permission.PROJECT_VIEW,
        Permission.CONTENT_ENTRY_CREATE,
        Permission.CONTENT_ENTRY_UPDATE,
        Permission.AI_GENERATE,
        Permission.MEDIA_MANAGE,
      ]),
    );
    expect(effectivePermissions(null, 'editor')).not.toContain(
      Permission.CONTENT_ENTRY_PUBLISH,
    );
    expect(effectivePermissions(null, 'editor')).not.toContain(
      Permission.PROJECT_MEMBERS_MANAGE,
    );
  });

  it('viewer → read only', () => {
    expect(effectivePermissions(null, 'viewer')).toEqual(
      perms([Permission.PROJECT_VIEW]),
    );
  });
});

describe('effectivePermissions — cascade union', () => {
  it('member + editor: union — member keeps VIEW_ALL, gains content actions', () => {
    const result = effectivePermissions('member', 'editor');
    expect(result).toEqual(
      perms([
        Permission.WORKSPACE_VIEW,
        Permission.WORKSPACE_MEMBERS_VIEW,
        Permission.WORKSPACE_LOGS_VIEW,
        Permission.PROJECT_VIEW,
        Permission.PROJECT_VIEW_ALL,
        Permission.CONTENT_ENTRY_CREATE,
        Permission.CONTENT_ENTRY_UPDATE,
        Permission.AI_GENERATE,
        Permission.MEDIA_MANAGE,
      ]),
    );
  });

  it('guest + editor: gains project actions, keeps ASSIGNED scope, never VIEW_ALL', () => {
    const result = effectivePermissions('guest', 'editor');
    expect(result).toContain(Permission.PROJECT_VIEW_ASSIGNED);
    expect(result).toContain(Permission.CONTENT_ENTRY_CREATE);
    expect(result).not.toContain(Permission.PROJECT_VIEW_ALL);
  });

  it('ws admin + any project role → unchanged (already a superset)', () => {
    const before = effectivePermissions('admin');
    expect(effectivePermissions('admin', 'viewer')).toEqual(before);
    expect(effectivePermissions('admin', 'admin')).toEqual(before);
  });

  it('member + project admin → gains project management', () => {
    const result = effectivePermissions('member', 'admin');
    expect(result).toContain(Permission.PROJECT_MEMBERS_MANAGE);
    expect(result).toContain(Permission.PROJECT_DELETE);
    expect(result).toContain(Permission.PROJECT_VIEW_ALL); // from the ws member side
    expect(result).not.toContain(Permission.WORKSPACE_EDIT);
  });

  it('project role never elevates workspace permissions', () => {
    expect(effectivePermissions('guest', 'admin')).not.toContain(
      Permission.WORKSPACE_VIEW,
    );
    expect(effectivePermissions(null, 'admin')).not.toContain(
      Permission.WORKSPACE_MEMBERS_MANAGE,
    );
  });
});

describe('effectivePermissions — safety properties', () => {
  it('returns a fresh set — mutating the result never corrupts the maps', () => {
    const result = effectivePermissions('member', 'viewer');
    result.add(Permission.WORKSPACE_DELETE);

    expect(WORKSPACE_ROLE_PERMISSIONS.member).not.toContain(
      Permission.WORKSPACE_DELETE,
    );
    expect(effectivePermissions('member', 'viewer')).not.toContain(
      Permission.WORKSPACE_DELETE,
    );
  });

  it('null and undefined project roles behave identically', () => {
    expect(effectivePermissions('member', null)).toEqual(
      effectivePermissions('member', undefined),
    );
  });

  it('every workspace/project role resolves to a defined set', () => {
    const wsRoles: WorkspaceRole[] = ['owner', 'admin', 'member', 'guest'];
    const projRoles: ProjectRole[] = ['admin', 'editor', 'viewer'];
    for (const ws of wsRoles) {
      expect(WORKSPACE_ROLE_PERMISSIONS[ws]).toBeDefined();
    }
    for (const proj of projRoles) {
      expect(PROJECT_ROLE_PERMISSIONS[proj]).toBeDefined();
    }
  });

  it('power chains are monotonic subsets', () => {
    const isSubset = (a: Set<Permission>, b: Set<Permission>) =>
      [...a].every((p) => b.has(p));
    expect(isSubset(effectivePermissions('member'), effectivePermissions('admin'))).toBe(
      true,
    );
    expect(isSubset(effectivePermissions('admin'), effectivePermissions('owner'))).toBe(
      true,
    );
    expect(
      isSubset(effectivePermissions(null, 'viewer'), effectivePermissions(null, 'editor')),
    ).toBe(true);
    expect(
      isSubset(effectivePermissions(null, 'editor'), effectivePermissions(null, 'admin')),
    ).toBe(true);
  });
});

describe('getProjectScope', () => {
  it.each([
    [null, 'NONE'],
    [undefined, 'NONE'],
    ['guest', 'ASSIGNED'],
    ['member', 'ALL'],
    ['admin', 'ALL'],
    ['owner', 'ALL'],
  ] as const)('%p → %p', (wsRole, expected) => {
    expect(getProjectScope(wsRole)).toBe(expected);
  });
});
