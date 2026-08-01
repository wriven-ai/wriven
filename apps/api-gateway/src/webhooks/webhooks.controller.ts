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
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthUser,
  CORE_PATTERNS,
  CreateWebhookDto,
  Permission,
  SERVICE_TOKENS,
  UpdateWebhookDto,
} from '@wriven/contracts';
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
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Post()
  @RequirePermission(Permission.WEBHOOK_MANAGE)
  create(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: CreateWebhookDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.WEBHOOK_CREATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get()
  @RequirePermission(Permission.PROJECT_VIEW)
  list(@CurrentProject() projectId: string) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.WEBHOOK_LIST, { projectId }),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.WEBHOOK_MANAGE)
  update(
    @CurrentProject() projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.WEBHOOK_UPDATE, { projectId, id, dto }),
    );
  }

  @Delete(':id')
  @RequirePermission(Permission.WEBHOOK_MANAGE)
  remove(@CurrentProject() projectId: string, @Param('id') id: string) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.WEBHOOK_DELETE, { projectId, id }),
    );
  }
}
