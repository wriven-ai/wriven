import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminProjectsQueryDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRoles } from './admin-roles.decorator';
import { AdminRolesGuard } from './admin-roles.guard';
import { Audit } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';

/** Cross-tenant project oversight. Soft-delete gated + audited. */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('admin/projects')
export class AdminProjectsController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: AdminProjectsQueryDto) {
    return firstValueFrom(this.auth.send(ADMIN_PATTERNS.PROJECTS_LIST, query));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return firstValueFrom(this.auth.send(ADMIN_PATTERNS.PROJECTS_GET, { id }));
  }

  /** Aggregated per-project usage (core-owned tables: content, media, keys, webhooks, AI). */
  @Get(':id/usage')
  usage(@Param('id') id: string) {
    return firstValueFrom(
      this.core.send(ADMIN_PATTERNS.PROJECT_USAGE, { projectId: id }),
    );
  }

  @AdminRoles('admin')
  @Audit('project.delete', 'project')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return firstValueFrom(
      this.auth.send(ADMIN_PATTERNS.PROJECTS_DELETE, { id }),
    );
  }
}
