import {
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminScopedQueryDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRoles } from './admin-roles.decorator';
import { AdminRolesGuard } from './admin-roles.guard';
import { Audit } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';

/** Cross-tenant webhook oversight. Read = any admin; disable gated + audited. */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('admin/webhooks')
export class AdminWebhooksController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: AdminScopedQueryDto) {
    return firstValueFrom(this.core.send(ADMIN_PATTERNS.WEBHOOKS_LIST, query));
  }

  @AdminRoles('admin', 'moderator')
  @Audit('webhook.disable', 'webhook')
  @Patch(':id/disable')
  disable(@Param('id') id: string) {
    return firstValueFrom(
      this.core.send(ADMIN_PATTERNS.WEBHOOKS_DISABLE, { id }),
    );
  }
}
