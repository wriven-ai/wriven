import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import * as contracts from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { CurrentWorkspaceRole } from '../auth/current-workspace-role.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../auth/workspace.guard';

@Controller('support/tickets')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class SupportController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Post('attachments/presign')
  presign(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: contracts.PresignTicketAttachmentDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.SUPPORT_PRESIGN, {
        workspaceId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Post()
  create(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: contracts.CreateTicketDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.SUPPORT_CREATE, {
        workspaceId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get()
  list(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentWorkspaceRole() workspaceRole: string,
    @Query() dto: contracts.ListTicketsQueryDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.SUPPORT_LIST, {
        workspaceId,
        userId: user.userId,
        workspaceRole,
        dto,
      }),
    );
  }

  @Get(':id')
  get(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentWorkspaceRole() workspaceRole: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.SUPPORT_GET, {
        workspaceId,
        userId: user.userId,
        workspaceRole,
        id,
      }),
    );
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: contracts.CreateTicketMessageDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.SUPPORT_REPLY, {
        workspaceId,
        userId: user.userId,
        id,
        dto,
      }),
    );
  }

  @Patch(':id')
  close(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() _dto: contracts.CloseTicketDto,
  ) {
    return firstValueFrom(
      this.core.send(contracts.CORE_PATTERNS.SUPPORT_CLOSE, {
        workspaceId,
        userId: user.userId,
        id,
      }),
    );
  }
}
