import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminListQueryDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRolesGuard } from './admin-roles.guard';

/** Read the admin audit log. Any authenticated admin (read-only feed). */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@Controller('admin/audit-log')
export class AdminAuditController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: AdminListQueryDto) {
    return firstValueFrom(this.auth.send(ADMIN_PATTERNS.AUDIT_LIST, query));
  }
}
