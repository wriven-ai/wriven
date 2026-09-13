import { Controller, Get, Inject, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminScopedQueryDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRolesGuard } from './admin-roles.guard';
import { AuditInterceptor } from './audit.interceptor';

import { sendWithTimeout } from '../common/send-with-timeout';
/** Cross-tenant content-type oversight (read-only). */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('admin/content-types')
export class AdminContentTypesController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: AdminScopedQueryDto) {
    return sendWithTimeout(this.core, ADMIN_PATTERNS.CONTENT_TYPES_LIST, query);
  }
}
