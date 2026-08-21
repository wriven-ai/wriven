import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  Permission,
  SERVICE_TOKENS,
  USAGE_PATTERNS,
} from '@wriven/contracts';
import type { ProjectStatsView, WorkspaceStatsView } from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentProject } from '../auth/current-project.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { ProjectGuard } from '../auth/project.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { WorkspaceUsageComposer } from '../billing/workspace-usage.composer';

/**
 * Aggregate stats, header-scoped like `GET /usage`. The workspace view is
 * composed via {@link WorkspaceUsageComposer} (shared with the downgrade guard).
 */
@Controller('stats')
export class StatsController {
  constructor(
    private readonly usage: WorkspaceUsageComposer,
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get('workspace')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, PermissionGuard)
  @RequirePermission(Permission.WORKSPACE_VIEW)
  workspace(
    @CurrentWorkspace() workspaceId: string,
  ): Promise<WorkspaceStatsView> {
    return this.usage.compose(workspaceId);
  }

  @Get('project')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard, PermissionGuard)
  @RequirePermission(Permission.PROJECT_VIEW)
  project(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
  ): Promise<ProjectStatsView> {
    return firstValueFrom(
      this.core.send<ProjectStatsView>(USAGE_PATTERNS.PROJECT_STATS, {
        workspaceId,
        projectId,
      }),
    );
  }
}
