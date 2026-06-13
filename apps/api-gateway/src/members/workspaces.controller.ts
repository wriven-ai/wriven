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
  SERVICE_TOKENS,
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

  @Get(':workspaceId/members')
  list(@CurrentUser() user: AuthUser, @Param('workspaceId') workspaceId: string) {
    return firstValueFrom(
      this.auth.send(WORKSPACE_PATTERNS.LIST_MEMBERS, {
        callerUserId: user.userId,
        workspaceId,
      }),
    );
  }

  @Post(':workspaceId/members')
  add(
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
  update(
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
  remove(
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
