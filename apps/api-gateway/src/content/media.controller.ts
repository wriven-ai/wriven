import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import * as contracts from '@wriven/contracts';
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

import { sendWithTimeout } from '../common/send-with-timeout';
@Controller('content/media')
@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard, PermissionGuard)
@UseInterceptors(WorkspaceAuditInterceptor)
export class MediaController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Post('presign')
  @RequirePermission(contracts.Permission.MEDIA_MANAGE)
  presign(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: contracts.PresignUploadDto,
  ) {
    return sendWithTimeout(this.core, contracts.CORE_PATTERNS.MEDIA_PRESIGN, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      });
  }

  @Post()
  @RequirePermission(contracts.Permission.MEDIA_MANAGE)
  @WorkspaceAudit('media.upload', 'media')
  async create(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: contracts.CreateMediaDto,
    @Req() req: AuditRequest,
  ) {
    const result = await sendWithTimeout<contracts.MediaView>(this.core, contracts.CORE_PATTERNS.MEDIA_CREATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      });
    req.logMeta = {
      filename: result.originalFilename ?? dto.key,
      kind: result.kind,
      ...(result.sizeBytes != null ? { size: result.sizeBytes } : {}),
    };
    return result;
  }

  @Get()
  @RequirePermission(contracts.Permission.PROJECT_VIEW)
  list(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
  ) {
    return sendWithTimeout(this.core, contracts.CORE_PATTERNS.MEDIA_LIST, {
        workspaceId,
        projectId,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search || undefined,
        sort: sort || undefined,
      });
  }

  @Get(':id')
  @RequirePermission(contracts.Permission.PROJECT_VIEW)
  get(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return sendWithTimeout(this.core, contracts.CORE_PATTERNS.MEDIA_GET, { workspaceId, projectId, id });
  }

  @Delete(':id')
  @RequirePermission(contracts.Permission.MEDIA_MANAGE)
  @WorkspaceAudit('media.delete', 'media')
  remove(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Param('id') id: string,
  ) {
    return sendWithTimeout(this.core, contracts.CORE_PATTERNS.MEDIA_DELETE, { workspaceId, projectId, id });
  }

  /** Bulk delete — atomic DB soft-delete (scoped to the project) + R2 cleanup. */
  @Post('bulk-delete')
  @RequirePermission(contracts.Permission.MEDIA_MANAGE)
  @WorkspaceAudit('media.delete', 'media')
  async removeMany(
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: contracts.DeleteMediaBulkDto,
    @Req() req: AuditRequest,
  ) {
    const result = await sendWithTimeout<{ success: boolean; deleted: number }>(this.core, contracts.CORE_PATTERNS.MEDIA_DELETE_BULK, {
        workspaceId,
        projectId,
        ids: dto.ids,
      });
    req.logMeta = { count: result.deleted };
    return result;
  }
}
