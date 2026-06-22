import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthUser,
  CORE_PATTERNS,
  CreateContentTypeDto,
  CreateEntryDto,
  ListEntriesQueryDto,
  SERVICE_TOKENS,
  UpdateContentTypeDto,
  UpdateEntryDto,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentProject } from '../auth/current-project.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectGuard } from '../auth/project.guard';
import { WorkspaceGuard } from '../auth/workspace.guard';

@Controller('content')
@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard)
export class ContentController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  // ── Content types ───────────────────────────────────────────────────────────

  @Post('types')
  createType(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: CreateContentTypeDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.CONTENT_TYPE_CREATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get('types')
  listTypes(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.CONTENT_TYPE_LIST, { workspaceId, projectId }),
    );
  }

  @Get('types/:id')
  getType(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.CONTENT_TYPE_GET, { workspaceId, projectId, id }),
    );
  }

  @Patch('types/:id')
  updateType(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContentTypeDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.CONTENT_TYPE_UPDATE, {
        workspaceId,
        projectId,
        id,
        dto,
      }),
    );
  }

  @Delete('types/:id')
  deleteType(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.CONTENT_TYPE_DELETE, { workspaceId, projectId, id }),
    );
  }

  // ── Entries ───────────────────────────────────────────────────────────────

  @Post('entries')
  createEntry(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: CreateEntryDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_CREATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get('entries')
  listEntries(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Query() query: ListEntriesQueryDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_LIST, { workspaceId, projectId, query }),
    );
  }

  @Get('entries/:id')
  getEntry(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_GET, { workspaceId, projectId, id }),
    );
  }

  @Patch('entries/:id')
  updateEntry(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEntryDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_UPDATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        id,
        dto,
      }),
    );
  }

  @Post('entries/:id/publish')
  publishEntry(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_PUBLISH, {
        workspaceId,
        projectId,
        userId: user.userId,
        id,
      }),
    );
  }

  @Delete('entries/:id')
  deleteEntry(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_DELETE, { workspaceId, projectId, id }),
    );
  }
}
