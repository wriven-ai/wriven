import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { httpContext } from '../testing/http';

beforeAll(() => {
  Logger.overrideLogger([]);
});

const META = { action: 'user.suspended', target: 'user' };

function makeInterceptor(meta: Record<string, unknown> | undefined = META) {
  const send = jest.fn((_pattern: unknown, _payload: Record<string, unknown>) => of(null));
  const reflector = { get: jest.fn(() => meta) };
  const interceptor = new AuditInterceptor(reflector as never, { send } as never);
  return { interceptor, send };
}

function run(interceptor: AuditInterceptor, req: Record<string, unknown>, result: unknown) {
  interceptor.intercept(httpContext(req), { handle: () => of(result) }).subscribe();
}

describe('AuditInterceptor (admin) — gates + attribution', () => {
  it('no @Audit metadata → passthrough, no write', () => {
    const send = jest.fn((_pattern: unknown, _payload: Record<string, unknown>) => of(null));
    const interceptor = new AuditInterceptor(
      { get: jest.fn(() => undefined) } as never,
      { send } as never,
    );
    let seen: unknown;
    interceptor
      .intercept(httpContext({ adminUser: { adminUserId: 'a-1' } }), { handle: () => of('v') })
      .subscribe((v) => (seen = v));
    expect(seen).toBe('v');
    expect(send).not.toHaveBeenCalled();
  });

  it('no admin identity on the request → no write', () => {
    const { interceptor, send } = makeInterceptor();
    run(interceptor, { params: { id: 'u-9' } }, {});
    expect(send).not.toHaveBeenCalled();
  });

  it('happy path: acting admin, route :id target, auditMeta, ip', () => {
    const { interceptor, send } = makeInterceptor();
    run(
      interceptor,
      {
        adminUser: { adminUserId: 'a-1' },
        params: { id: 'u-9' },
        auditMeta: { reason: 'abuse' },
        ip: '10.1.2.3',
      },
      { ok: true },
    );

    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        adminUserId: 'a-1',
        action: 'user.suspended',
        targetType: 'user',
        targetId: 'u-9', // route param wins
        metadata: { reason: 'abuse' },
        ip: '10.1.2.3',
      }),
    );
  });

  it('create routes (no :id param) fall back to the result entity id', () => {
    const { interceptor, send } = makeInterceptor({ action: 'plan.created', target: 'plan' });
    run(interceptor, { adminUser: { adminUserId: 'a-1' }, params: {} }, { id: 'plan-7' });
    expect(send.mock.calls[0][1].targetId).toBe('plan-7');
  });

  it('a failed audit write never fails the admin request', () => {
    const send = jest.fn((_pattern: unknown, _payload: unknown) => throwError(() => new Error('down')));
    const reflector = { get: jest.fn(() => META) };
    const interceptor = new AuditInterceptor(reflector as never, { send } as never);

    expect(() =>
      interceptor
        .intercept(httpContext({ adminUser: { adminUserId: 'a-1' }, params: { id: 'u-9' } }), {
          handle: () => of({ success: true }),
        })
        .subscribe((v) => expect(v).toEqual({ success: true })),
    ).not.toThrow();
  });
});
