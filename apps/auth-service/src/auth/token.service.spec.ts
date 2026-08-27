import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac } from 'crypto';
import { TokenService } from './token.service';
import { configStub } from '../testing/config-stub';

afterEach(() => {
  jest.useRealTimers(); // inline restores leak fake timers when an expect throws
});


function makeService(configMap: Record<string, unknown> = {}) {
  const jwt = { sign: jest.fn().mockReturnValue('signed-token') };
  const config = configStub(configMap);
  const service = new TokenService(
    jwt as unknown as JwtService,
    config,
  );
  return { service, jwt, config };
}

describe('signAccessToken', () => {
  it('signs {sub, email} with the TTL resolved to ms', () => {
    const { service, jwt } = makeService({ JWT_ACCESS_TTL: '15m' });
    expect(service.signAccessToken({ id: 'u1', email: 'a@b.c' })).toBe(
      'signed-token',
    );
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: 'u1', email: 'a@b.c' },
      { expiresIn: 900_000 },
    );
  });

  it('defaults the TTL to 15m when unconfigured', () => {
    const { service, jwt } = makeService();
    service.signAccessToken({ id: 'u1', email: 'a@b.c' });
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expiresIn: 900_000 }),
    );
  });
});

describe('newOpaqueToken / newRefreshToken', () => {
  it('returns a 96-char hex raw token and its sha256 hash', () => {
    const { service } = makeService();
    const { raw, hash } = service.newOpaqueToken();
    expect(raw).toMatch(/^[0-9a-f]{96}$/);
    expect(hash).toBe(createHash('sha256').update(raw).digest('hex'));
  });

  it('mints a distinct pair each call', () => {
    const { service } = makeService();
    expect(service.newRefreshToken().raw).not.toBe(
      service.newRefreshToken().raw,
    );
  });
});

describe('hash', () => {
  it('sha256 hex of the input', () => {
    const { service } = makeService();
    expect(service.hash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('newVerificationCode', () => {
  it('always yields a 6-digit zero-padded string', () => {
    const { service } = makeService();
    for (let i = 0; i < 50; i += 1) {
      expect(service.newVerificationCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe('hashVerificationCode', () => {
  const hmac = (pepper: string, code: string) =>
    createHmac('sha256', pepper).update(code).digest('hex');

  it('uses OTP_PEPPER when set', () => {
    const { service } = makeService({ OTP_PEPPER: 'pepper' });
    expect(service.hashVerificationCode('123456')).toBe(
      hmac('pepper', '123456'),
    );
  });

  it('falls back to JWT_SECRET, then to an empty pepper', () => {
    const withJwt = makeService({ JWT_SECRET: 'jwt-secret' });
    expect(withJwt.service.hashVerificationCode('123456')).toBe(
      hmac('jwt-secret', '123456'),
    );
    const bare = makeService();
    expect(bare.service.hashVerificationCode('123456')).toBe(
      hmac('', '123456'),
    );
  });

  it('OTP_PEPPER wins over JWT_SECRET when both are set', () => {
    const { service } = makeService({
      OTP_PEPPER: 'pepper',
      JWT_SECRET: 'jwt-secret',
    });
    expect(service.hashVerificationCode('123456')).toBe(
      hmac('pepper', '123456'),
    );
  });
});

describe('refresh TTL', () => {
  it('picks the right key per rememberMe with 7d/30d defaults', () => {
    const { service } = makeService();
    expect(service.refreshTtlMs(false)).toBe(604_800_000);
    expect(service.refreshTtlMs(true)).toBe(2_592_000_000);
  });

  it('honors custom configured TTLs', () => {
    const { service } = makeService({
      JWT_REFRESH_TTL: '1d',
      JWT_REFRESH_TTL_REMEMBER: '60d',
    });
    expect(service.refreshTtlMs(false)).toBe(86_400_000);
    expect(service.refreshTtlMs(true)).toBe(5_184_000_000);
  });

  it('refreshExpiresAt = now + ttl', () => {
    const { service } = makeService();
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(service.refreshExpiresAt(false)).toEqual(
      new Date('2026-01-08T00:00:00.000Z'),
    );
    jest.useRealTimers();
  });
});
