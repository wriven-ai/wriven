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

@Controller('content')
@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard, PermissionGuard)
export class ContentController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  // ── Content types ───────────────────────────────────────────────────────────

  @Post('types')
  @RequirePermission(contracts.Permission.CONTENT_TYPE_MANAGE)
  createType(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: contracts.CreateContentTypeDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.CONTENT_TYPE_CREATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get('types')
  @RequirePermission(contracts.Permission.PROJECT_VIEW)
  listTypes(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.CONTENT_TYPE_LIST, {
        workspaceId,
        projectId,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  @Get('types/:id')
  @RequirePermission(contracts.Permission.PROJECT_VIEW)
  getType(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.CONTENT_TYPE_GET, { workspaceId, projectId, id }),
    );
  }

  @Patch('types/:id')
  @RequirePermission(contracts.Permission.CONTENT_TYPE_MANAGE)
  updateType(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
    @Body() dto: contracts.UpdateContentTypeDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.CONTENT_TYPE_UPDATE, {
        workspaceId,
        projectId,
        id,
        dto,
      }),
    );
  }

  @Delete('types/:id')
  @RequirePermission(contracts.Permission.CONTENT_TYPE_MANAGE)
  deleteType(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.CONTENT_TYPE_DELETE, { workspaceId, projectId, id }),
    );
  }

  // ── Entries ───────────────────────────────────────────────────────────────

  @Post('entries')
  @RequirePermission(contracts.Permission.CONTENT_ENTRY_CREATE)
  createEntry(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: contracts.CreateEntryDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.ENTRY_CREATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get('entries')
  @RequirePermission(contracts.Permission.PROJECT_VIEW)
  listEntries(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Query() query: contracts.ListEntriesQueryDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.ENTRY_LIST, { workspaceId, projectId, query }),
    );
  }

  @Get('entries/:id')
  @RequirePermission(contracts.Permission.PROJECT_VIEW)
  getEntry(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.ENTRY_GET, { workspaceId, projectId, id }),
    );
  }

  @Patch('entries/:id')
  @RequirePermission(contracts.Permission.CONTENT_ENTRY_UPDATE)
  updateEntry(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
    @Body() dto: contracts.UpdateEntryDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.ENTRY_UPDATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        id,
        dto,
      }),
    );
  }

  @Post('entries/:id/publish')
  @RequirePermission(contracts.Permission.CONTENT_ENTRY_PUBLISH)
  publishEntry(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.ENTRY_PUBLISH, {
        workspaceId,
        projectId,
        userId: user.userId,
        id,
      }),
    );
  }

  @Delete('entries/:id')
  @RequirePermission(contracts.Permission.CONTENT_ENTRY_DELETE)
  deleteEntry(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.ENTRY_DELETE, { workspaceId, projectId, id }),
    );
  }

  @Get('entries/:id/revisions')
  @RequirePermission(contracts.Permission.PROJECT_VIEW)
  listRevisions(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.ENTRY_REVISIONS, {
        workspaceId,
        projectId,
        entryId: id,
      }),
    );
  }

  @Post('entries/:id/revisions/:version/restore')
  @RequirePermission(contracts.Permission.CONTENT_ENTRY_UPDATE)
  restoreRevision(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
    @Param('version') version: string,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.ENTRY_REVISION_RESTORE, {
        workspaceId,
        projectId,
        userId: user.userId,
        entryId: id,
        version: Number(version),
      }),
    );
  }
}
