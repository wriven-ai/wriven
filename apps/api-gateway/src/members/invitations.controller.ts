import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthUser,
  CreateProjectInvitationDto,
  CreateWorkspaceInvitationDto,
  INVITATION_PATTERNS,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class InvitationsController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────────

  @Post('workspaces/:workspaceId/invitations')
  @UseGuards(JwtAuthGuard)
  createWorkspace(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateWorkspaceInvitationDto,
  ) {
    return firstValueFrom(
      this.auth.send(INVITATION_PATTERNS.CREATE, {
        callerUserId: user.userId,
        scope: 'workspace',
        workspaceId,
        email: dto.email,
        role: dto.role,
      }),
    );
  }

  @Post('projects/:projectId/invitations')
  @UseGuards(JwtAuthGuard)
  createProject(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectInvitationDto,
  ) {
    return firstValueFrom(
      this.auth.send(INVITATION_PATTERNS.CREATE, {
        callerUserId: user.userId,
        scope: 'project',
        projectId,
        email: dto.email,
        role: dto.role,
      }),
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────────

  @Get('workspaces/:workspaceId/invitations')
  @UseGuards(JwtAuthGuard)
  listWorkspace(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return firstValueFrom(
      this.auth.send(INVITATION_PATTERNS.LIST, {
        callerUserId: user.userId,
        scope: 'workspace',
        workspaceId,
      }),
    );
  }

  @Get('projects/:projectId/invitations')
  @UseGuards(JwtAuthGuard)
  listProject(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return firstValueFrom(
      this.auth.send(INVITATION_PATTERNS.LIST, {
        callerUserId: user.userId,
        scope: 'project',
        projectId,
      }),
    );
  }

  // ── Revoke / resend ────────────────────────────────────────────────────────────

  @Delete('invitations/:id')
  @UseGuards(JwtAuthGuard)
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return firstValueFrom(
      this.auth.send(INVITATION_PATTERNS.REVOKE, {
        callerUserId: user.userId,
        id,
      }),
    );
  }

  @Post('invitations/:id/resend')
  @UseGuards(JwtAuthGuard)
  resend(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return firstValueFrom(
      this.auth.send(INVITATION_PATTERNS.RESEND, {
        callerUserId: user.userId,
        id,
      }),
    );
  }

  // ── Public preview + accept ──────────────────────────────────────────────────

  /** Public — the accept page reads this before the user is authenticated. */
  @Get('invitations/token/:token')
  preview(@Param('token') token: string) {
    return firstValueFrom(
      this.auth.send(INVITATION_PATTERNS.PREVIEW, { token }),
    );
  }

  @Post('invitations/token/:token/accept')
  @UseGuards(JwtAuthGuard)
  accept(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return firstValueFrom(
      this.auth.send(INVITATION_PATTERNS.ACCEPT, {
        token,
        userId: user.userId,
      }),
    );
  }
}
