import type { ConfigService } from '@nestjs/config';
import type { ClientProxy } from '@nestjs/microservices';
import { NEVER, of, throwError } from 'rxjs';
import { AppController } from './app.controller';

function makeController(overrides: {
  authSend?: ClientProxy['send'];
  coreSend?: ClientProxy['send'];
}) {
  const authClient = {
    send: overrides.authSend ?? jest.fn(() => of({ service: 'auth-service', db: 'up' })),
  } as unknown as ClientProxy;
  const coreClient = {
    send: overrides.coreSend ?? jest.fn(() => of({ service: 'core-service', db: 'up' })),
  } as unknown as ClientProxy;
  const config = {
    get: () => 'http://wriven-ai:8000',
  } as unknown as ConfigService;
  return new AppController(authClient, coreClient, config);
}

describe('AppController /v1/health', () => {
  const fetchMock = jest.spyOn(global, 'fetch');

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    } as unknown as Response);
  });

  afterAll(() => {
    fetchMock.mockRestore();
  });

  it('reports every dependency when all are up', async () => {
    const c = makeController({});

    const res = await c.health();

    expect(res).toEqual({
      gateway: 'up',
      auth: { service: 'auth-service', db: 'up' },
      core: { service: 'core-service', db: 'up' },
      ai: { status: 'ok' },
    });
  });

  it('degrades a hung TCP dependency to status down instead of hanging the route', async () => {
    // A ClientTCP send whose server died mid-restart never resolves — the
    // rxjs timeout is the only bound. Real timers would cost 2s per run.
    jest.useFakeTimers();
    try {
      const c = makeController({ authSend: jest.fn(() => NEVER) });

      const pending = c.health();
      await jest.advanceTimersByTimeAsync(2_000);
      const res = (await pending) as {
        gateway: string;
        auth: { status: string; error: string };
        core: unknown;
      };

      expect(res.gateway).toBe('up');
      expect(res.auth).toEqual({
        status: 'down',
        error: 'timeout after 2000ms',
      });
      expect(res.core).toEqual({ service: 'core-service', db: 'up' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('degrades an immediately failing TCP dependency to status down', async () => {
    const c = makeController({
      coreSend: jest.fn(() => throwError(() => new Error('ECONNREFUSED'))),
    });

    const res = (await c.health()) as {
      gateway: string;
      core: { status: string; error: string };
    };

    expect(res.gateway).toBe('up');
    expect(res.core).toEqual({ status: 'down', error: 'ECONNREFUSED' });
  });
});
