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
  AddProjectMemberDto,
  AuthUser,
  CreateProjectDto,
  PROJECT_PATTERNS,
  SERVICE_TOKENS,
  UpdateProjectDto,
  UpdateProjectMemberDto,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  // ── Project CRUD ────────────────────────────────────────────────────────────

  @Post('workspaces/:workspaceId/projects')
  create(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return firstValueFrom(
      this.auth.send(PROJECT_PATTERNS.CREATE_PROJECT, {
        callerUserId: user.userId,
        workspaceId,
        dto,
      }),
    );
  }

  @Get('workspaces/:workspaceId/projects')
  list(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return firstValueFrom(
      this.auth.send(PROJECT_PATTERNS.LIST_PROJECTS, {
        callerUserId: user.userId,
        workspaceId,
      }),
    );
  }

  @Get('projects/:projectId')
  get(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return firstValueFrom(
      this.auth.send(PROJECT_PATTERNS.GET_PROJECT, {
        callerUserId: user.userId,
        projectId,
      }),
    );
  }

  @Patch('projects/:projectId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return firstValueFrom(
      this.auth.send(PROJECT_PATTERNS.UPDATE_PROJECT, {
        callerUserId: user.userId,
        projectId,
        dto,
      }),
    );
  }

  @Delete('projects/:projectId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return firstValueFrom(
      this.auth.send(PROJECT_PATTERNS.DELETE_PROJECT, {
        callerUserId: user.userId,
        projectId,
      }),
    );
  }

  // ── Project members ─────────────────────────────────────────────────────────

  @Get('projects/:projectId/members')
  listMembers(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return firstValueFrom(
      this.auth.send(PROJECT_PATTERNS.LIST_MEMBERS, {
        callerUserId: user.userId,
        projectId,
      }),
    );
  }

  @Post('projects/:projectId/members')
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    return firstValueFrom(
      this.auth.send(PROJECT_PATTERNS.ADD_MEMBER, {
        callerUserId: user.userId,
        projectId,
        dto,
      }),
    );
  }

  @Patch('projects/:projectId/members/:userId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateProjectMemberDto,
  ) {
    return firstValueFrom(
      this.auth.send(PROJECT_PATTERNS.UPDATE_MEMBER, {
        callerUserId: user.userId,
        projectId,
        targetUserId,
        dto,
      }),
    );
  }

  @Delete('projects/:projectId/members/:userId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('userId') targetUserId: string,
  ) {
    return firstValueFrom(
      this.auth.send(PROJECT_PATTERNS.REMOVE_MEMBER, {
        callerUserId: user.userId,
        projectId,
        targetUserId,
      }),
    );
  }
}
