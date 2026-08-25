import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { AdminTokenService } from './admin-token.service';
import { configStub } from '../testing/config-stub';

const SECRET = 'admin-secret';

function makeService(map: Record<string, unknown> = {}) {
  return new AdminTokenService(configStub({ ADMIN_JWT_SECRET: SECRET, ...map }));
}

describe('AdminTokenService.signAccessToken', () => {
  it('round-trips an HS256 admin token with typ/role/sub claims', () => {
    const service = makeService();

    const token = service.signAccessToken({
      id: 'a-1',
      email: 'admin@wriven.dev',
      role: 'admin',
    });

    // Verify with an independent JwtService over the same secret.
    const decoded = new JwtService({ secret: SECRET }).verify(token);
    expect(decoded).toMatchObject({
      sub: 'a-1',
      email: 'admin@wriven.dev',
      role: 'admin',
      typ: 'admin',
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
  });

  it('a token signed with the admin secret fails verification under a different secret', () => {
    const service = makeService();
    const token = service.signAccessToken({
      id: 'a-1',
      email: 'admin@wriven.dev',
      role: 'admin',
    });

    expect(() =>
      new JwtService({ secret: 'tenant-secret' }).verify(token),
    ).toThrow();
  });
});

describe('AdminTokenService.newRefreshToken / hash', () => {
  it('raw token is 96-hex; stored hash is its sha256 — never the raw value', () => {
    const service = makeService();

    const { raw, hash } = service.newRefreshToken();

    expect(raw).toMatch(/^[0-9a-f]{96}$/);
    expect(hash).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(hash).not.toBe(raw);
  });

  it('two minted tokens never collide', () => {
    const service = makeService();
    expect(service.newRefreshToken().raw).not.toBe(service.newRefreshToken().raw);
  });
});

describe('AdminTokenService.refreshExpiresAt', () => {
  it('defaults to 7 days out; honors ADMIN_REFRESH_TTL', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const defaultService = makeService();
    const customService = makeService({ ADMIN_REFRESH_TTL: '30d' });

    const day = 24 * 60 * 60 * 1000;
    expect(defaultService.refreshExpiresAt().getTime() - Date.now()).toBe(7 * day);
    expect(customService.refreshExpiresAt().getTime() - Date.now()).toBe(30 * day);

    jest.useRealTimers();
  });
});
