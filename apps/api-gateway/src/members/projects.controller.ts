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
  UseInterceptors,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import * as contracts from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceAudit } from '../common/workspace-audit.decorator';
import { WorkspaceAuditInterceptor } from '../common/workspace-audit.interceptor';

@Controller()
@UseGuards(JwtAuthGuard)
@UseInterceptors(WorkspaceAuditInterceptor)
export class ProjectsController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  // ── Project CRUD ────────────────────────────────────────────────────────────

  @Post('workspaces/:workspaceId/projects')
  @WorkspaceAudit('project.create', 'project')
  async create(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: contracts.CreateProjectDto,
  ) {
    return firstValueFrom<{ id: string }>(
      this.auth.send(contracts.PROJECT_PATTERNS.CREATE_PROJECT, {
        callerUserId: user.userId,
        workspaceId,
        dto,
      }),
    );
  }

  @Get('workspaces/:workspaceId/projects')
  list(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.PROJECT_PATTERNS.LIST_PROJECTS, {
        callerUserId: user.userId,
        workspaceId,
      }),
    );
  }

  @Get('projects/:projectId')
  get(@CurrentUser() user: contracts.AuthUser, @Param('projectId') projectId: string) {
    return firstValueFrom(
      this.auth.send(contracts.PROJECT_PATTERNS.GET_PROJECT, {
        callerUserId: user.userId,
        projectId,
      }),
    );
  }

  @Patch('projects/:projectId')
  @WorkspaceAudit('project.update', 'project')
  update(
    @CurrentUser() user: contracts.AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: contracts.UpdateProjectDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.PROJECT_PATTERNS.UPDATE_PROJECT, {
        callerUserId: user.userId,
        projectId,
        dto,
      }),
    );
  }

  @Delete('projects/:projectId')
  @WorkspaceAudit('project.delete', 'project')
  remove(
    @CurrentUser() user: contracts.AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.PROJECT_PATTERNS.DELETE_PROJECT, {
        callerUserId: user.userId,
        projectId,
      }),
    );
  }

  // ── Project members ─────────────────────────────────────────────────────────

  @Get('projects/:projectId/members')
  listMembers(
    @CurrentUser() user: contracts.AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.PROJECT_PATTERNS.LIST_MEMBERS, {
        callerUserId: user.userId,
        projectId,
      }),
    );
  }

  @Post('projects/:projectId/members')
  addMember(
    @CurrentUser() user: contracts.AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: contracts.AddProjectMemberDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.PROJECT_PATTERNS.ADD_MEMBER, {
        callerUserId: user.userId,
        projectId,
        dto,
      }),
    );
  }

  @Patch('projects/:projectId/members/:userId')
  updateMember(
    @CurrentUser() user: contracts.AuthUser,
    @Param('projectId') projectId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: contracts.UpdateProjectMemberDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.PROJECT_PATTERNS.UPDATE_MEMBER, {
        callerUserId: user.userId,
        projectId,
        targetUserId,
        dto,
      }),
    );
  }

  @Delete('projects/:projectId/members/:userId')
  removeMember(
    @CurrentUser() user: contracts.AuthUser,
    @Param('projectId') projectId: string,
    @Param('userId') targetUserId: string,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.PROJECT_PATTERNS.REMOVE_MEMBER, {
        callerUserId: user.userId,
        projectId,
        targetUserId,
      }),
    );
  }
}
