import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { WorkspaceAuditInterceptor } from './workspace-audit.interceptor';
import { httpContext } from '../testing/http';

beforeAll(() => {
  Logger.overrideLogger([]);
});

function makeInterceptor(meta: Record<string, unknown> | undefined) {
  const send = jest.fn((_pattern: unknown, _payload: Record<string, unknown>) => of(null));
  const reflector = { get: jest.fn(() => meta) };
  const interceptor = new WorkspaceAuditInterceptor(reflector as never, { send } as never);
  return { interceptor, send };
}

/** Run the interceptor over a completed handler; tap effects settle synchronously. */
function run(
  interceptor: WorkspaceAuditInterceptor,
  req: Record<string, unknown>,
  result: unknown,
) {
  interceptor.intercept(httpContext(req), { handle: () => of(result) }).subscribe();
}

const META = { action: 'project.create', target: 'project' };

describe('WorkspaceAuditInterceptor — metadata + actor gates', () => {
  it('no @WorkspaceAudit metadata → pure passthrough, nothing logged', () => {
    const { interceptor, send } = makeInterceptor(undefined);
    let seen: unknown;
    interceptor
      .intercept(httpContext({ user: { userId: 'u1' } }), {
        handle: () => of('value'),
      })
      .subscribe((v) => (seen = v));
    expect(seen).toBe('value');
    expect(send).not.toHaveBeenCalled();
  });

  it('unauthenticated request (no user) → no audit write', () => {
    const { interceptor, send } = makeInterceptor(META);
    run(interceptor, { params: {} }, { id: 'x' });
    expect(send).not.toHaveBeenCalled();
  });

  it('no resolvable workspace → no audit write (row must be scoping, not guessing)', () => {
    const { interceptor, send } = makeInterceptor(META);
    run(interceptor, { user: { userId: 'u1' }, params: {} }, { id: 'x' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('WorkspaceAuditInterceptor — workspace attribution precedence', () => {
  const cases: Array<[string, Record<string, unknown>, unknown, string]> = [
    ['guard-injected req.workspaceId wins', { user: { userId: 'u1' }, workspaceId: 'ws-guard', params: { workspaceId: 'ws-param' } }, {}, 'ws-guard'],
    ['path :workspaceId', { user: { userId: 'u1' }, params: { workspaceId: 'ws-param' } }, {}, 'ws-param'],
    ['result.workspace.id (workspace create)', { user: { userId: 'u1' }, params: {} }, { workspace: { id: 'ws-created' } }, 'ws-created'],
    ['result.workspaceId (project view/delete)', { user: { userId: 'u1' }, params: {} }, { workspaceId: 'ws-result' }, 'ws-result'],
  ];

  it.each(cases)('%s', (_name, req, result, expectedWs) => {
    const { interceptor, send } = makeInterceptor(META);
    run(interceptor, req, result);
    const payload = send.mock.calls[0][1];
    expect(payload.workspaceId).toBe(expectedWs);
    expect(payload.userId).toBe('u1');
    expect(payload.action).toBe('project.create');
  });
});

describe('WorkspaceAuditInterceptor — target + project attribution', () => {
  it('route :id param beats the result id', () => {
    const { interceptor, send } = makeInterceptor(META);
    run(interceptor, { user: { userId: 'u1' }, workspaceId: 'ws-1', params: { id: 'from-param' } }, { id: 'from-result' });
    expect(send.mock.calls[0][1].targetId).toBe('from-param');
  });

  it('nested create results (webhook/apiKey) resolve their entity id', () => {
    const { interceptor, send } = makeInterceptor({ action: 'webhook.create', target: 'webhook' });
    run(interceptor, { user: { userId: 'u1' }, workspaceId: 'ws-1', params: {} }, { webhook: { id: 'wh-9' } });
    expect(send.mock.calls[0][1].targetId).toBe('wh-9');
  });

  it('project.* actions: the target id doubles as projectId; result projectId also works', () => {
    const viaTarget = makeInterceptor(META);
    run(viaTarget.interceptor, { user: { userId: 'u1' }, workspaceId: 'ws-1', params: { id: 'p-7' } }, {});
    expect(viaTarget.send.mock.calls[0][1].projectId).toBe('p-7');

    const viaResult = makeInterceptor({ action: 'project.update', target: 'project' });
    run(viaResult.interceptor, { user: { userId: 'u1' }, workspaceId: 'ws-1', params: { id: 'x' } }, { projectId: 'p-from-result' });
    expect(viaResult.send.mock.calls[0][1].projectId).toBe('p-from-result');
  });

  it('req.logMeta rides along as metadata', () => {
    const { interceptor, send } = makeInterceptor(META);
    run(interceptor, { user: { userId: 'u1' }, workspaceId: 'ws-1', params: {}, logMeta: { slug: 'x' } }, {});
    expect(send.mock.calls[0][1].metadata).toEqual({ slug: 'x' });
  });

  it('a failed LOG_WRITE never fails the request (fire-and-forget)', () => {
    const send = jest.fn(() => throwError(() => new Error('auth svc down')));
    const reflector = { get: jest.fn(() => META) };
    const interceptor = new WorkspaceAuditInterceptor(reflector as never, { send } as never);

    expect(() =>
      interceptor
        .intercept(httpContext({ user: { userId: 'u1' }, workspaceId: 'ws-1', params: {} }), {
          handle: () => of({ ok: true }),
        })
        .subscribe((v) => expect(v).toEqual({ ok: true })),
    ).not.toThrow();
  });
});
