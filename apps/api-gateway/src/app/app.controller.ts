import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { AUTH_PATTERNS, CORE_PATTERNS, SERVICE_TOKENS } from '@wriven/contracts';
import { firstValueFrom, of, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

/** Per-TCP-dependency budget. Render's health check kills the instance at 5s,
 * so this route must answer well under that no matter what the dependencies
 * do — see the 2026-09-09 incident where an auth/core restart left these
 * sends hung forever and Render killed a perfectly healthy gateway. */
const PING_TIMEOUT_MS = 2_000;

@Controller()
export class AppController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE)
    private readonly authClient: ClientProxy,
    @Inject(SERVICE_TOKENS.CORE_SERVICE)
    private readonly coreClient: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  /** Public — no guard on this controller (only the global throttler applies). */
  @Get()
  root() {
    return {
      name: 'wriven-api',
      status: 'ok',
      endpoints: { health: '/v1/health' },
    };
  }

  /** GET /v1/health — reports the gateway's view of every dependency, always
   *  200. Each ping runs concurrently and is bounded; a slow or dead
   *  dependency degrades to a `{ status: 'down' }` field instead of hanging
   *  the route past Render's 5s limit. Failing the health check for a
   *  downstream blip would only restart the one component that was healthy —
   *  the gateway — so non-200 is reserved for gateway-level failures that
   *  Render can actually fix by restarting it. */
  @Get('health')
  async health() {
    const [auth, core, ai] = await Promise.all([
      this.pingDownstream(this.authClient, AUTH_PATTERNS.PING),
      this.pingDownstream(this.coreClient, CORE_PATTERNS.PING),
      this.pingAi(),
    ]);
    return { gateway: 'up', auth, core, ai };
  }

  /** One TCP ping with a hard timeout. NestJS ClientTCP sends never time out
   *  on their own — a write into a socket whose server died mid-restart never
   *  errors the observable — so the timeout is the only thing that turns a
   *  hang into a reported `down`. */
  private pingDownstream(client: ClientProxy, pattern: string): Promise<unknown> {
    return firstValueFrom(
      client.send(pattern, {}).pipe(
        timeout(PING_TIMEOUT_MS),
        catchError((err: unknown) =>
          of({
            status: 'down',
            error:
              err instanceof TimeoutError
                ? `timeout after ${PING_TIMEOUT_MS}ms`
                : err instanceof Error
                  ? err.message
                  : String(err),
          }),
        ),
      ),
    );
  }

  /** Liveness ping to the FastAPI ai-service over HTTP (the only non-TCP
   *  dependency). ai-service `/health` is unauthenticated; a short timeout +
   *  try/catch keep a slow/down AI service from failing the whole route. */
  private async pingAi(): Promise<unknown> {
    const baseUrl = this.config.get<string>('AI_SERVICE_URL');
    if (!baseUrl) {
      return { status: 'down', error: 'AI_SERVICE_URL not configured' };
    }
    try {
      const res = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!res.ok) {
        return { status: 'down', error: `ai-service HTTP ${res.status}` };
      }
      return res.json();
    } catch (err) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
