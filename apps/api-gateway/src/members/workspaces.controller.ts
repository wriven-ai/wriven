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
  AddWorkspaceMemberDto,
  AuthUser,
  CreateWorkspaceDto,
  SERVICE_TOKENS,
  UpdateWorkspaceDto,
  UpdateWorkspaceMemberDto,
  WORKSPACE_PATTERNS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  // ── Workspace CRUD ───────────────────────────────────────────────────────────

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return firstValueFrom(
      this.auth.send(WORKSPACE_PATTERNS.CREATE_WORKSPACE, {
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return firstValueFrom(
      this.auth.send(WORKSPACE_PATTERNS.LIST_WORKSPACES, {
        userId: user.userId,
      }),
    );
  }

  @Get(':workspaceId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return firstValueFrom(
      this.auth.send(WORKSPACE_PATTERNS.GET_WORKSPACE, {
        callerUserId: user.userId,
        workspaceId,
      }),
    );
  }

  @Patch(':workspaceId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return firstValueFrom(
      this.auth.send(WORKSPACE_PATTERNS.UPDATE_WORKSPACE, {
        callerUserId: user.userId,
        workspaceId,
        dto,
      }),
    );
  }

  @Delete(':workspaceId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return firstValueFrom(
      this.auth.send(WORKSPACE_PATTERNS.DELETE_WORKSPACE, {
        callerUserId: user.userId,
        workspaceId,
      }),
    );
  }

  // ── Workspace members ────────────────────────────────────────────────────────

  @Get(':workspaceId/members')
  listMembers(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return firstValueFrom(
      this.auth.send(WORKSPACE_PATTERNS.LIST_MEMBERS, {
        callerUserId: user.userId,
        workspaceId,
      }),
    );
  }

  @Post(':workspaceId/members')
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: AddWorkspaceMemberDto,
  ) {
    return firstValueFrom(
      this.auth.send(WORKSPACE_PATTERNS.ADD_MEMBER, {
        callerUserId: user.userId,
        workspaceId,
        dto,
      }),
    );
  }

  @Patch(':workspaceId/members/:userId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateWorkspaceMemberDto,
  ) {
    return firstValueFrom(
      this.auth.send(WORKSPACE_PATTERNS.UPDATE_MEMBER, {
        callerUserId: user.userId,
        workspaceId,
        targetUserId,
        dto,
      }),
    );
  }

  @Delete(':workspaceId/members/:userId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
  ) {
    return firstValueFrom(
      this.auth.send(WORKSPACE_PATTERNS.REMOVE_MEMBER, {
        callerUserId: user.userId,
        workspaceId,
        targetUserId,
      }),
    );
  }
}
