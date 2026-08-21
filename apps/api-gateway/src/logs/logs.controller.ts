import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  Paginated,
  Permission,
  SERVICE_TOKENS,
  WORKSPACE_PATTERNS,
  WorkspaceLogQueryDto,
  WorkspaceLogView,
} from '@wriven/contracts';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { WorkspaceGuard } from '../auth/workspace.guard';

/** Workspace activity feed — members and above (RBAC WORKSPACE_LOGS_VIEW). */
@Controller('logs')
@UseGuards(JwtAuthGuard, WorkspaceGuard, PermissionGuard)
export class LogsController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get()
  @RequirePermission(Permission.WORKSPACE_LOGS_VIEW)
  list(
    @CurrentWorkspace() workspaceId: string,
    @Query() query: WorkspaceLogQueryDto,
  ): Promise<Paginated<WorkspaceLogView>> {
    return firstValueFrom(
      this.auth.send<Paginated<WorkspaceLogView>>(
        WORKSPACE_PATTERNS.LOG_LIST,
        { workspaceId, ...query },
      ),
    );
  }
}
