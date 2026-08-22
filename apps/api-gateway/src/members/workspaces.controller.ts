import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import * as contracts from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuditRequest,
  WorkspaceAudit,
} from '../common/workspace-audit.decorator';
import { WorkspaceAuditInterceptor } from '../common/workspace-audit.interceptor';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
@UseInterceptors(WorkspaceAuditInterceptor)
export class WorkspacesController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  // ── Workspace CRUD ───────────────────────────────────────────────────────────

  @Post()
  create(@CurrentUser() user: contracts.AuthUser, @Body() dto: contracts.CreateWorkspaceDto) {
    return firstValueFrom(
      this.auth.send(contracts.WORKSPACE_PATTERNS.CREATE_WORKSPACE, {
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get()
  list(@CurrentUser() user: contracts.AuthUser) {
    return firstValueFrom(
      this.auth.send(contracts.WORKSPACE_PATTERNS.LIST_WORKSPACES, {
        userId: user.userId,
      }),
    );
  }

  @Get(':workspaceId')
  get(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.WORKSPACE_PATTERNS.GET_WORKSPACE, {
        callerUserId: user.userId,
        workspaceId,
      }),
    );
  }

  @Patch(':workspaceId')
  @WorkspaceAudit('workspace.update', 'workspace')
  async update(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: contracts.UpdateWorkspaceDto,
    @Req() req: AuditRequest,
  ) {
    const result = await firstValueFrom<contracts.WorkspaceView>(
      this.auth.send(contracts.WORKSPACE_PATTERNS.UPDATE_WORKSPACE, {
        callerUserId: user.userId,
        workspaceId,
        dto,
      }),
    );
    req.logMeta = { name: result.name };
    return result;
  }

  @Delete(':workspaceId')
  remove(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.WORKSPACE_PATTERNS.DELETE_WORKSPACE, {
        callerUserId: user.userId,
        workspaceId,
      }),
    );
  }

  // ── Workspace members ────────────────────────────────────────────────────────

  @Get(':workspaceId/members')
  listMembers(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.WORKSPACE_PATTERNS.LIST_MEMBERS, {
        callerUserId: user.userId,
        workspaceId,
      }),
    );
  }

  @Post(':workspaceId/members')
  @WorkspaceAudit('member.add', 'member')
  async addMember(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: contracts.AddWorkspaceMemberDto,
    @Req() req: AuditRequest,
  ) {
    const result = await firstValueFrom<contracts.WorkspaceMemberView>(
      this.auth.send(contracts.WORKSPACE_PATTERNS.ADD_MEMBER, {
        callerUserId: user.userId,
        workspaceId,
        dto,
      }),
    );
    req.logMeta = {
      email: result.user.email,
      name: result.user.name,
      role: result.role,
    };
    return result;
  }

  @Patch(':workspaceId/members/:userId')
  @WorkspaceAudit('member.update', 'member')
  async updateMember(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: contracts.UpdateWorkspaceMemberDto,
    @Req() req: AuditRequest,
  ) {
    const result = await firstValueFrom<contracts.WorkspaceMemberView>(
      this.auth.send(contracts.WORKSPACE_PATTERNS.UPDATE_MEMBER, {
        callerUserId: user.userId,
        workspaceId,
        targetUserId,
        dto,
      }),
    );
    req.logMeta = {
      email: result.user.email,
      name: result.user.name,
      role: result.role,
    };
    return result;
  }

  @Delete(':workspaceId/members/:userId')
  @WorkspaceAudit('member.remove', 'member')
  removeMember(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.WORKSPACE_PATTERNS.REMOVE_MEMBER, {
        callerUserId: user.userId,
        workspaceId,
        targetUserId,
      }),
    );
  }
}
