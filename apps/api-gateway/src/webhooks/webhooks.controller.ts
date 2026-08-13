import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
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

/** Dashboard management of outgoing webhooks (session/cookie auth). */
@Controller('webhooks')
@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard, PermissionGuard)
export class WebhooksController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Post()
  @RequirePermission(contracts.Permission.WEBHOOK_MANAGE)
  create(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: contracts.CreateWebhookDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.WEBHOOK_CREATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get()
  @RequirePermission(contracts.Permission.PROJECT_VIEW)
  list(@CurrentProject() projectId: string) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.WEBHOOK_LIST, { projectId }),
    );
  }

  @Patch(':id')
  @RequirePermission(contracts.Permission.WEBHOOK_MANAGE)
  update(
    @CurrentProject() projectId: string,
    @Param('id') id: string,
    @Body() dto: contracts.UpdateWebhookDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.WEBHOOK_UPDATE, { projectId, id, dto }),
    );
  }

  @Delete(':id')
  @RequirePermission(contracts.Permission.WEBHOOK_MANAGE)
  remove(@CurrentProject() projectId: string, @Param('id') id: string) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.WEBHOOK_DELETE, { projectId, id }),
    );
  }
}
