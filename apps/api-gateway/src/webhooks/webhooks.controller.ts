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
  SERVICE_TOKENS,
  UpdateWebhookDto,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentProject } from '../auth/current-project.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectGuard } from '../auth/project.guard';
import { WorkspaceGuard } from '../auth/workspace.guard';

/** Dashboard management of outgoing webhooks (session/cookie auth). */
@Controller('webhooks')
@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard)
export class WebhooksController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Post()
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
  list(@CurrentProject() projectId: string) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.WEBHOOK_LIST, { projectId }),
    );
  }

  @Patch(':id')
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
  remove(@CurrentProject() projectId: string, @Param('id') id: string) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.WEBHOOK_DELETE, { projectId, id }),
    );
  }
}
