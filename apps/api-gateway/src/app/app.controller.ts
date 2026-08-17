import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { AUTH_PATTERNS, CORE_PATTERNS, SERVICE_TOKENS } from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';

@Controller()
export class AppController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE)
    private readonly authClient: ClientProxy,
    @Inject(SERVICE_TOKENS.CORE_SERVICE)
    private readonly coreClient: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  /** GET /v1/ — API root. Static service metadata + a link to the liveness
   *  check. Public (AppController sits behind no JWT guard). */
  @Get()
  root() {
    return {
      name: 'wriven-api',
      status: 'ok',
      endpoints: { health: '/v1/health' },
    };
  }

  /** GET /v1/health — verifies gateway can reach both TCP services + the HTTP
   *  ai-service. auth/core are fatal (routing depends on them); ai is reported
   *  but non-fatal — the CMS still serves when only AI generation is down. */
  @Get('health')
  async health() {
    const [auth, core] = await Promise.all([
      firstValueFrom(this.authClient.send(AUTH_PATTERNS.PING, {})),
      firstValueFrom(this.coreClient.send(CORE_PATTERNS.PING, {})),
    ]);
    const ai = await this.pingAi();
    return { gateway: 'up', auth, core, ai };
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
