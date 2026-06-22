import { Controller, Get, Inject } from '@nestjs/common';
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
  ) {}

  /** GET /api/v1/health — verifies gateway can reach both TCP services. */
  @Get('health')
  async health() {
    const [auth, core] = await Promise.all([
      firstValueFrom(this.authClient.send(AUTH_PATTERNS.PING, {})),
      firstValueFrom(this.coreClient.send(CORE_PATTERNS.PING, {})),
    ]);
    return { gateway: 'up', auth, core };
  }
}
