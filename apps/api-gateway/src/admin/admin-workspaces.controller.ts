import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import * as contracts from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRoles } from './admin-roles.decorator';
import { AdminRolesGuard } from './admin-roles.guard';
import { Audit } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';
import { CurrentAdmin } from './current-admin.decorator';

/** Cross-tenant workspace oversight + plan assignment. */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('admin/workspaces')
export class AdminWorkspacesController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: contracts.AdminListQueryDto) {
    return firstValueFrom(this.auth.send(contracts.ADMIN_PATTERNS.WORKSPACES_LIST, query));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return firstValueFrom(this.auth.send(contracts.ADMIN_PATTERNS.WORKSPACES_GET, { id }));
  }

  @AdminRoles('admin')
  @Audit('workspace.setPlan', 'workspace')
  @Put(':id/plan')
  setPlan(
    @Param('id') id: string,
    @Body() dto: contracts.AssignPlanDto,
    @CurrentAdmin() admin: contracts.AdminAuthUser,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.ADMIN_PATTERNS.WORKSPACES_SET_PLAN, {
        workspaceId: id,
        dto,
        adminUserId: admin.adminUserId,
      }),
    );
  }
}
