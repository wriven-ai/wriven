import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  Permission,
  SERVICE_TOKENS,
  USAGE_PATTERNS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import type { UsageView } from '@wriven/contracts';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { WorkspaceGuard } from '../auth/workspace.guard';

/** Current-period usage for the active workspace; read open to any member. */
@Controller('usage')
@UseGuards(JwtAuthGuard, WorkspaceGuard, PermissionGuard)
export class UsageController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get()
  @RequirePermission(Permission.WORKSPACE_VIEW)
  read(@CurrentWorkspace() workspaceId: string): Promise<UsageView> {
    return firstValueFrom(
      this.core.send<UsageView>(USAGE_PATTERNS.READ, { workspaceId }),
    );
  }
}
