import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
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
@UseInterceptors(WorkspaceAuditInterceptor)
export class InvitationsController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────────

  @Post('workspaces/:workspaceId/invitations')
  @UseGuards(JwtAuthGuard)
  @WorkspaceAudit('invitation.create', 'invitation')
  createWorkspace(
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: contracts.CreateWorkspaceInvitationDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.INVITATION_PATTERNS.CREATE, {
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
  @WorkspaceAudit('invitation.create', 'invitation')
  createProject(
    @CurrentUser() user: contracts.AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: contracts.CreateProjectInvitationDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.INVITATION_PATTERNS.CREATE, {
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
    @CurrentUser() user: contracts.AuthUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.INVITATION_PATTERNS.LIST, {
        callerUserId: user.userId,
        scope: 'workspace',
        workspaceId,
      }),
    );
  }

  @Get('projects/:projectId/invitations')
  @UseGuards(JwtAuthGuard)
  listProject(
    @CurrentUser() user: contracts.AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.INVITATION_PATTERNS.LIST, {
        callerUserId: user.userId,
        scope: 'project',
        projectId,
      }),
    );
  }

  // ── Revoke / resend ────────────────────────────────────────────────────────────

  @Delete('invitations/:id')
  @UseGuards(JwtAuthGuard)
  @WorkspaceAudit('invitation.revoke', 'invitation')
  revoke(@CurrentUser() user: contracts.AuthUser, @Param('id') id: string) {
    return firstValueFrom(
      this.auth.send(contracts.INVITATION_PATTERNS.REVOKE, {
        callerUserId: user.userId,
        id,
      }),
    );
  }

  @Post('invitations/:id/resend')
  @UseGuards(JwtAuthGuard)
  resend(@CurrentUser() user: contracts.AuthUser, @Param('id') id: string) {
    return firstValueFrom(
      this.auth.send(contracts.INVITATION_PATTERNS.RESEND, {
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
      this.auth.send(contracts.INVITATION_PATTERNS.PREVIEW, { token }),
    );
  }

  @Post('invitations/token/:token/accept')
  @UseGuards(JwtAuthGuard)
  accept(@CurrentUser() user: contracts.AuthUser, @Param('token') token: string) {
    return firstValueFrom(
      this.auth.send(contracts.INVITATION_PATTERNS.ACCEPT, {
        token,
        userId: user.userId,
      }),
    );
  }
}
