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

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
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
  update(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: contracts.UpdateWorkspaceDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.WORKSPACE_PATTERNS.UPDATE_WORKSPACE, {
        callerUserId: user.userId,
        workspaceId,
        dto,
      }),
    );
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
  addMember(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: contracts.AddWorkspaceMemberDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.WORKSPACE_PATTERNS.ADD_MEMBER, {
        callerUserId: user.userId,
        workspaceId,
        dto,
      }),
    );
  }

  @Patch(':workspaceId/members/:userId')
  updateMember(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: contracts.UpdateWorkspaceMemberDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.WORKSPACE_PATTERNS.UPDATE_MEMBER, {
        callerUserId: user.userId,
        workspaceId,
        targetUserId,
        dto,
      }),
    );
  }

  @Delete(':workspaceId/members/:userId')
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
