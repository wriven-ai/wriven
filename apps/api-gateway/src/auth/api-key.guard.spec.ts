import { ERROR_CODES } from '@wriven/contracts';
import { of } from 'rxjs';
import { ApiKeyGuard } from './api-key.guard';
import { httpContext } from '../testing/http';

function resolution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    workspaceId: 'ws-1',
    projectId: 'p1',
    scope: 'read',
    ...overrides,
  };
}

function makeGuard(sendResult: unknown = of(resolution()), allowedScopes?: string[]) {
  const send = jest.fn(() => sendResult);
  const core = { send } as never;
  const reflector = {
    getAllAndOverride: jest.fn(() => allowedScopes),
  } as never;
  return { guard: new ApiKeyGuard(core, reflector), send };
}

function reqWith(token: string | null) {
  const headers = token === null ? {} : { authorization: `Bearer ${token}` };
  return { headers };
}

// The guard's cache is module-scoped and keyed by sha256(token) — unique
// tokens per test keep entries from bleeding across tests.
let tokenSeq = 0;
const freshToken = () => `wrk_live_unique_${++tokenSeq}`;

describe('ApiKeyGuard — bearer extraction', () => {
  it('no Authorization header → UNAUTHORIZED, core never called', async () => {
    const { guard, send } = makeGuard();
    await expect(guard.canActivate(httpContext(reqWith(null)))).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED.code,
      message: expect.stringContaining('Bearer API key is required'),
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('empty Bearer token → UNAUTHORIZED', async () => {
    const { guard } = makeGuard();
    await expect(
      guard.canActivate(httpContext({ headers: { authorization: 'Bearer ' } })),
    ).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHORIZED.code });
  });

  it('non-Bearer scheme → UNAUTHORIZED', async () => {
    const { guard, send } = makeGuard();
    await expect(
      guard.canActivate(httpContext({ headers: { authorization: 'Basic xyz' } })),
    ).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHORIZED.code });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('ApiKeyGuard — resolution + scope gate', () => {
  it('core resolves null → Invalid or revoked API key', async () => {
    const { guard } = makeGuard(of(null));
    await expect(
      guard.canActivate(httpContext(reqWith(freshToken()))),
    ).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED.code,
      message: expect.stringContaining('Invalid or revoked'),
    });
  });

  it('route requires a scope the key lacks → FORBIDDEN', async () => {
    const { guard } = makeGuard(of(resolution({ scope: 'read' })), ['manage']);
    await expect(
      guard.canActivate(httpContext(reqWith(freshToken()))),
    ).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN.code,
      message: expect.stringContaining('lacks the required scope'),
    });
  });

  it('key scope satisfies the route scope → passes', async () => {
    const { guard } = makeGuard(of(resolution({ scope: 'manage' })), ['manage', 'preview']);
    await expect(
      guard.canActivate(httpContext(reqWith(freshToken()))),
    ).resolves.toBe(true);
  });

  it('no scope metadata → any scope passes', async () => {
    const { guard } = makeGuard(of(resolution({ scope: 'preview' })), undefined);
    await expect(
      guard.canActivate(httpContext(reqWith(freshToken()))),
    ).resolves.toBe(true);
  });

  it('happy path: request pinned to the key project/workspace', async () => {
    const token = freshToken();
    const { guard, send } = makeGuard();
    const req: Record<string, unknown> = reqWith(token);

    await expect(guard.canActivate(httpContext(req))).resolves.toBe(true);

    expect(send).toHaveBeenCalledWith(expect.anything(), { token });
    expect(req.apiKey).toMatchObject({ projectId: 'p1', workspaceId: 'ws-1', scope: 'read' });
    expect(req.projectId).toBe('p1');
    expect(req.workspaceId).toBe('ws-1');
  });
});

describe('ApiKeyGuard — resolution cache (30s TTL, hash-keyed)', () => {
  it('same token resolves once within the TTL', async () => {
    const token = freshToken();
    const { guard, send } = makeGuard();

    await guard.canActivate(httpContext(reqWith(token)));
    await guard.canActivate(httpContext(reqWith(token)));

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('cache expiry re-resolves', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const token = freshToken();
    const { guard, send } = makeGuard();

    await guard.canActivate(httpContext(reqWith(token)));
    jest.setSystemTime(new Date('2026-01-01T00:00:31.000Z')); // past the TTL
    await guard.canActivate(httpContext(reqWith(token)));

    expect(send).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('a null resolution is cached too — revocation propagates after ≤ TTL', async () => {
    const token = freshToken();
    const { guard, send } = makeGuard(of(null));

    await expect(guard.canActivate(httpContext(reqWith(token)))).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED.code,
    });
    await expect(guard.canActivate(httpContext(reqWith(token)))).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED.code,
    });
    expect(send).toHaveBeenCalledTimes(1); // null also cached
  });

  it('distinct tokens never share a cache entry', async () => {
    const { guard, send } = makeGuard();
    await guard.canActivate(httpContext(reqWith(freshToken())));
    await guard.canActivate(httpContext(reqWith(freshToken())));
    expect(send).toHaveBeenCalledTimes(2);
  });
});
