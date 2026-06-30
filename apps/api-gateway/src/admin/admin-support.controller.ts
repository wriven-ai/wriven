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
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminAuthUser,
  AdminReplyDto,
  AdminTicketListQueryDto,
  AdminUpdateTicketDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRoles } from './admin-roles.decorator';
import { AdminRolesGuard } from './admin-roles.guard';
import { Audit } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';
import { CurrentAdmin } from './current-admin.decorator';

/** Cross-tenant support ticket management for platform staff. */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('admin/support/tickets')
export class AdminSupportController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: AdminTicketListQueryDto) {
    return firstValueFrom(this.core.send(ADMIN_PATTERNS.SUPPORT_LIST, query));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return firstValueFrom(
      this.core.send(ADMIN_PATTERNS.SUPPORT_GET, { id }),
    );
  }

  @AdminRoles('admin', 'moderator')
  @Audit('support.reply', 'ticket')
  @Post(':id/messages')
  reply(
    @Param('id') id: string,
    @Body() dto: AdminReplyDto,
    @CurrentAdmin() admin: AdminAuthUser,
  ) {
    return firstValueFrom(
      this.core.send(ADMIN_PATTERNS.SUPPORT_REPLY, {
        id,
        adminUserId: admin.adminUserId,
        dto,
      }),
    );
  }

  @AdminRoles('admin', 'moderator')
  @Audit('support.update', 'ticket')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AdminUpdateTicketDto) {
    return firstValueFrom(
      this.core.send(ADMIN_PATTERNS.SUPPORT_UPDATE, { id, dto }),
    );
  }
}
