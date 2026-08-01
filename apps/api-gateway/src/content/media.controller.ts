import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthUser,
  CORE_PATTERNS,
  CreateMediaDto,
  PresignUploadDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentProject } from '../auth/current-project.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectGuard } from '../auth/project.guard';
import { WorkspaceGuard } from '../auth/workspace.guard';

@Controller('content/media')
@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard)
export class MediaController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Post('presign')
  presign(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: PresignUploadDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.MEDIA_PRESIGN, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: CreateMediaDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.MEDIA_CREATE, {
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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.MEDIA_LIST, {
        workspaceId,
        projectId,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  @Get(':id')
  get(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.MEDIA_GET, { workspaceId, projectId, id }),
    );
  }

  @Delete(':id')
  remove(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.MEDIA_DELETE, { workspaceId, projectId, id }),
    );
  }
}
