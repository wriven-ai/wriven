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
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminAuthUser,
  AdminListQueryDto,
  AssignPlanDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
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
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: AdminListQueryDto) {
    return firstValueFrom(this.auth.send(ADMIN_PATTERNS.WORKSPACES_LIST, query));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return firstValueFrom(this.auth.send(ADMIN_PATTERNS.WORKSPACES_GET, { id }));
  }

  @AdminRoles('admin')
  @Audit('workspace.setPlan', 'workspace')
  @Put(':id/plan')
  setPlan(
    @Param('id') id: string,
    @Body() dto: AssignPlanDto,
    @CurrentAdmin() admin: AdminAuthUser,
  ) {
    return firstValueFrom(
      this.auth.send(ADMIN_PATTERNS.WORKSPACES_SET_PLAN, {
        workspaceId: id,
        dto,
        adminUserId: admin.adminUserId,
      }),
    );
  }
}
