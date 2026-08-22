import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import * as contracts from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentProject } from '../auth/current-project.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { ProjectGuard } from '../auth/project.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { WorkspaceGuard } from '../auth/workspace.guard';
import type { AuditRequest } from '../common/workspace-audit.decorator';
import { WorkspaceAudit } from '../common/workspace-audit.decorator';
import { WorkspaceAuditInterceptor } from '../common/workspace-audit.interceptor';

/**
 * Dashboard management of Delivery API keys (session/cookie auth). Distinct from
 * the public Delivery API, which is authenticated by the keys minted here.
 * Key material is sensitive — all routes require API_KEY_MANAGE.
 */
@Controller('api-keys')
@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard, PermissionGuard)
@RequirePermission(contracts.Permission.API_KEY_MANAGE)
@UseInterceptors(WorkspaceAuditInterceptor)
export class ApiKeysController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Post()
  @WorkspaceAudit('apiKey.create', 'apiKey')
  async create(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: contracts.CreateApiKeyDto,
    @Req() req: AuditRequest,
  ) {
    const result = await firstValueFrom<contracts.CreateApiKeyResult>(
      this.core.send(contracts.CORE_PATTERNS.API_KEY_CREATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      }),
    );
    req.logMeta = { name: result.key.name, scope: result.key.scope };
    return result;
  }

  @Get()
  list(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.API_KEY_LIST, { workspaceId, projectId }),
    );
  }

  @Post(':id/regenerate')
  @WorkspaceAudit('apiKey.regenerate', 'apiKey')
  async regenerate(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
    @Req() req: AuditRequest,
  ) {
    const result = await firstValueFrom<contracts.CreateApiKeyResult>(
      this.core.send(contracts.CORE_PATTERNS.API_KEY_REGENERATE, {
        workspaceId,
        projectId,
        id,
      }),
    );
    req.logMeta = { name: result.key.name };
    return result;
  }

  @Delete(':id')
  @WorkspaceAudit('apiKey.revoke', 'apiKey')
  revoke(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.API_KEY_REVOKE, {
        workspaceId,
        projectId,
        id,
      }),
    );
  }
}
