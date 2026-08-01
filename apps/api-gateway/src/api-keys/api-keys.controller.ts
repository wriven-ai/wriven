import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthUser,
  CORE_PATTERNS,
  CreateApiKeyDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentProject } from '../auth/current-project.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectGuard } from '../auth/project.guard';
import { WorkspaceGuard } from '../auth/workspace.guard';

/**
 * Dashboard management of Delivery API keys (session/cookie auth). Distinct from
 * the public Delivery API, which is authenticated by the keys minted here.
 */
@Controller('api-keys')
@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard)
export class ApiKeysController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.API_KEY_CREATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get()
  list(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.API_KEY_LIST, { workspaceId, projectId }),
    );
  }

  @Delete(':id')
  revoke(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.API_KEY_REVOKE, {
        workspaceId,
        projectId,
        id,
      }),
    );
  }
}
