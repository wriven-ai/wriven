import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import * as contracts from '@wriven/contracts';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRoles } from './admin-roles.decorator';
import { AdminRolesGuard } from './admin-roles.guard';
import { Audit } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';
import { CurrentAdmin } from './current-admin.decorator';

import { sendWithTimeout } from '../common/send-with-timeout';
/** Cross-tenant support ticket management for platform staff. */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('admin/support/tickets')
export class AdminSupportController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: contracts.AdminTicketListQueryDto) {
    return sendWithTimeout(this.core, contracts.ADMIN_PATTERNS.SUPPORT_LIST, query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return sendWithTimeout(this.core, contracts.ADMIN_PATTERNS.SUPPORT_GET, { id });
  }

  @AdminRoles('admin', 'moderator')
  @Audit('support.reply', 'ticket')
  @Post(':id/messages')
  reply(
    @Param('id') id: string,
    @Body() dto: contracts.AdminReplyDto,
    @CurrentAdmin() admin: contracts.AdminAuthUser,
  ) {
    return sendWithTimeout(this.core, contracts.ADMIN_PATTERNS.SUPPORT_REPLY, {
        id,
        adminUserId: admin.adminUserId,
        dto,
      });
  }

  @AdminRoles('admin', 'moderator')
  @Audit('support.update', 'ticket')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: contracts.AdminUpdateTicketDto) {
    return sendWithTimeout(this.core, contracts.ADMIN_PATTERNS.SUPPORT_UPDATE, { id, dto });
  }
}
