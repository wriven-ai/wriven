import { Test, type TestingModule } from '@nestjs/testing';
import { SERVICE_TOKENS } from '@wriven/contracts';
import { AppModule } from './app.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminJwtGuard } from '../admin/admin-jwt.guard';
import { UsageBufferService } from '../usage/usage-buffer.service';
import { GoogleStrategy } from '../auth/google.strategy';

/**
 * Bootstrap smoke: prove the real AppModule wires — every controller,
 * guard, interceptor, and client factory resolves. Unit specs construct
 * service graphs by hand, so only this spec catches a broken provider
 * token, a missing export, or a constructor that throws on real config.
 */
describe('AppModule — bootstrap smoke', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('compiles the full DI graph', () => {
    expect(moduleRef).toBeDefined();
  });

  it('resolves both downstream TCP client tokens', () => {
    const auth = moduleRef.get(SERVICE_TOKENS.AUTH_SERVICE, { strict: false });
    const core = moduleRef.get(SERVICE_TOKENS.CORE_SERVICE, { strict: false });
    expect(auth).toBeDefined();
    expect(core).toBeDefined();
    // Client proxies are lazy — constructing them opens no socket.
    expect(typeof (auth as { emit?: unknown }).emit).toBe('function');
    expect(typeof (core as { emit?: unknown }).emit).toBe('function');
  });

  it('constructs the guards and edge services with real ConfigService', () => {
    expect(moduleRef.get(JwtAuthGuard, { strict: false })).toBeInstanceOf(JwtAuthGuard);
    expect(moduleRef.get(AdminJwtGuard, { strict: false })).toBeInstanceOf(AdminJwtGuard);
    expect(moduleRef.get(GoogleStrategy, { strict: false })).toBeInstanceOf(GoogleStrategy);
    expect(moduleRef.get(UsageBufferService, { strict: false })).toBeInstanceOf(
      UsageBufferService,
    );
  });
});
