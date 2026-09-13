import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminAuditQueryDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRolesGuard } from './admin-roles.guard';

import { sendWithTimeout } from '../common/send-with-timeout';
/** Read the admin audit log. Any authenticated admin (read-only feed). */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@Controller('admin/audit-log')
export class AdminAuditController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: AdminAuditQueryDto) {
    return sendWithTimeout(this.auth, ADMIN_PATTERNS.AUDIT_LIST, query);
  }
}
