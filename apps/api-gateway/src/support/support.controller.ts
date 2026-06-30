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
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthUser,
  CloseTicketDto,
  CORE_PATTERNS,
  CreateTicketDto,
  CreateTicketMessageDto,
  ListTicketsQueryDto,
  PresignTicketAttachmentDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
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
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Post('attachments/presign')
  presign(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: PresignTicketAttachmentDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.SUPPORT_PRESIGN, {
        workspaceId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: CreateTicketDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.SUPPORT_CREATE, {
        workspaceId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentWorkspaceRole() workspaceRole: string,
    @Query() dto: ListTicketsQueryDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.SUPPORT_LIST, {
        workspaceId,
        userId: user.userId,
        workspaceRole,
        dto,
      }),
    );
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentWorkspaceRole() workspaceRole: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.SUPPORT_GET, {
        workspaceId,
        userId: user.userId,
        workspaceRole,
        id,
      }),
    );
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: CreateTicketMessageDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.SUPPORT_REPLY, {
        workspaceId,
        userId: user.userId,
        id,
        dto,
      }),
    );
  }

  @Patch(':id')
  close(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() _dto: CloseTicketDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.SUPPORT_CLOSE, {
        workspaceId,
        userId: user.userId,
        id,
      }),
    );
  }
}
