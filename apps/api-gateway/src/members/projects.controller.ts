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
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
    @Inject(contracts.SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  // ── Project CRUD ────────────────────────────────────────────────────────────

  @Post('workspaces/:workspaceId/projects')
  async create(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: contracts.CreateProjectDto,
  ) {
    const project = await firstValueFrom<{ id: string }>(
      this.auth.send(contracts.PROJECT_PATTERNS.CREATE_PROJECT, {
        callerUserId: user.userId,
        workspaceId,
        dto,
      }),
    );
    // Seed a starter content type so the new project isn't empty (best-effort).
    if (project?.id) {
      void firstValueFrom(
        this.core.send(contracts.CORE_PATTERNS.CONTENT_TYPE_SEED, {
          workspaceId,
          projectId: project.id,
          userId: user.userId,
        }),
      ).catch(() => undefined);
    }
    return project;
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
