import { of, throwError } from 'rxjs';
import { PROJECT_PATTERNS, WORKSPACE_PATTERNS } from '@wriven/contracts';
import type { ClientProxy } from '@nestjs/microservices';
import { WorkspaceGuard } from './workspace.guard';
import { ProjectGuard } from './project.guard';
import { httpContext } from '../testing/http';

type SendMock = ReturnType<typeof jest.fn>;

function clientMock() {
  return { send: jest.fn() } as unknown as ClientProxy & { send: SendMock };
}

describe('WorkspaceGuard', () => {
  it('missing X-Workspace-Id header → VALIDATION_ERROR', async () => {
    const guard = new WorkspaceGuard(clientMock());
    await expect(
      guard.canActivate(httpContext({ headers: {}, user: { userId: 'u1' } })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('no req.user (JwtAuthGuard skipped) → UNAUTHORIZED', async () => {
    const guard = new WorkspaceGuard(clientMock());
    await expect(
      guard.canActivate(httpContext({ headers: { 'x-workspace-id': 'ws-1' } })),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('validates membership via auth-service and pins scope on the request', async () => {
    const client = clientMock();
    client.send.mockReturnValue(
      of({
        workspaceId: 'ws-1',
        role: 'admin',
        permissions: ['WORKSPACE_VIEW', 'WORKSPACE_MEMBERS_VIEW'],
      }),
    );
    const guard = new WorkspaceGuard(client);
    const req: Record<string, unknown> = {
      headers: { 'x-workspace-id': 'ws-1' },
      user: { userId: 'u1', email: 'a@b.c' },
    };

    expect(await guard.canActivate(httpContext(req))).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      WORKSPACE_PATTERNS.VALIDATE_WORKSPACE_MEMBER,
      { userId: 'u1', workspaceId: 'ws-1' },
    );
    expect(req.workspaceId).toBe('ws-1');
    expect(req.workspaceRole).toBe('admin');
    expect(req.workspacePermissions).toBeInstanceOf(Set);
    expect((req.workspacePermissions as Set<string>).size).toBe(2);
  });

  it('auth-service FORBIDDEN rejection propagates', async () => {
    const client = clientMock();
    client.send.mockReturnValue(
      throwError(() => ({ code: 'FORBIDDEN', statusCode: 403, message: 'no' })),
    );
    const guard = new WorkspaceGuard(client);
    await expect(
      guard.canActivate(
        httpContext({
          headers: { 'x-workspace-id': 'ws-1' },
          user: { userId: 'u1' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('ProjectGuard', () => {
  it('missing X-Project-Id header → VALIDATION_ERROR', async () => {
    const guard = new ProjectGuard(clientMock());
    await expect(
      guard.canActivate(httpContext({ headers: {}, user: { userId: 'u1' } })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('pins projectId, authoritative workspace, nullable role, permission set', async () => {
    const client = clientMock();
    client.send.mockReturnValue(
      of({
        projectId: 'p1',
        workspaceId: 'ws-9', // resolved from the project row, NOT the header
        role: null, // ws owner/admin with no project_members row
        permissions: ['PROJECT_VIEW', 'PROJECT_EDIT'],
      }),
    );
    const guard = new ProjectGuard(client);
    const req: Record<string, unknown> = {
      headers: { 'x-project-id': 'p1' },
      user: { userId: 'u1' },
    };

    expect(await guard.canActivate(httpContext(req))).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      PROJECT_PATTERNS.VALIDATE_PROJECT_MEMBER,
      { userId: 'u1', projectId: 'p1' },
    );
    expect(req.projectId).toBe('p1');
    expect(req.projectWorkspaceId).toBe('ws-9');
    expect(req.projectRole).toBeNull();
    expect(req.projectPermissions).toBeInstanceOf(Set);
  });
});
