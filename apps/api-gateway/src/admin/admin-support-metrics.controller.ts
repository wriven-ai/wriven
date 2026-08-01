import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ADMIN_PATTERNS, SERVICE_TOKENS } from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRolesGuard } from './admin-roles.guard';

@UseGuards(AdminJwtGuard, AdminRolesGuard)
@Controller('admin/support')
export class AdminSupportMetricsController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get('metrics')
  metrics() {
    return firstValueFrom(this.core.send(ADMIN_PATTERNS.SUPPORT_METRICS, {}));
  }
}
