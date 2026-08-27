import 'reflect-metadata';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { ProxyAwareThrottlerGuard } from './proxy-aware.throttler.guard';
import { AuthController } from '../auth/auth.controller';

/** getTracker is protected — invoke it through the prototype like the guard does. */
const proto = ProxyAwareThrottlerGuard.prototype as unknown as {
  getTracker: (req: Record<string, unknown>) => Promise<string>;
};
const getTracker = proto.getTracker.bind(ProxyAwareThrottlerGuard.prototype);

async function tracker(headers: Record<string, unknown>, ip?: string): Promise<string> {
  return getTracker({ headers, ip });
}

describe('ProxyAwareThrottlerGuard.getTracker — client-IP resolution', () => {
  it('CF-Connecting-IP wins over everything (Cloudflare fronting)', async () => {
    expect(
      await tracker(
        { 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
        '192.0.2.9',
      ),
    ).toBe('198.51.100.7');
  });

  it('first X-Forwarded-For hop (Render LB) when no CF header', async () => {
    expect(
      await tracker({ 'x-forwarded-for': '203.0.113.5, 10.0.0.2' }, '192.0.2.9'),
    ).toBe('203.0.113.5');
  });

  it('socket ip as the direct-connection fallback', async () => {
    expect(await tracker({}, '192.0.2.9')).toBe('192.0.2.9');
  });

  it('empty/blank header strings fall through instead of bucketing everyone together', async () => {
    expect(await tracker({ 'cf-connecting-ip': '  ', 'x-forwarded-for': ' , 10.0.0.2' }, '192.0.2.9')).toBe(
      '192.0.2.9',
    );
  });

  it('array-typed headers (express can produce them) never crash the guard', async () => {
    await expect(
      tracker({ 'x-forwarded-for': ['203.0.113.8', '10.0.0.2'] }, '192.0.2.9'),
    ).resolves.toBe('192.0.2.9');
  });

  it('nothing resolvable → "unknown" bucket, never a throw', async () => {
    await expect(tracker({})).resolves.toBe('unknown');
  });
});

/**
 * Pin the @Throttle limits on the auth routes — they are the ONLY online
 * brute-force control for passwords and OTP codes. A dropped decorator or a
 * loosened limit must fail here.
 */
describe('AuthController @Throttle metadata — brute-force limits pinned', () => {
  const MINUTE = 60_000;
  const cases: Array<[string, number]> = [
    ['login', 10],
    ['register', 5],
    ['forgotPassword', 3],
    ['resetPassword', 5],
    ['verifyEmail', 10],
    ['verifyEmailCode', 10],
    ['resendVerification', 3],
  ];

  it.each(cases)('%s: %s/min', (method, limit) => {
    const handler = (AuthController.prototype as unknown as Record<string, unknown>)[method] as object;
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', handler)).toBe(limit);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', handler)).toBe(MINUTE);
  });
});
