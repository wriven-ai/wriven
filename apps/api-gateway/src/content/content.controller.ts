import {
  Body,
  Controller,
  Delete,
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
  CORE_PATTERNS,
  CreateContentTypeDto,
  CreateEntryDto,
  ListEntriesQueryDto,
  SERVICE_TOKENS,
  UpdateContentTypeDto,
  UpdateEntryDto,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../auth/workspace.guard';

@Controller('content')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ContentController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  // ── Content types ───────────────────────────────────────────────────────────

  @Post('types')
  createType(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: CreateContentTypeDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.CONTENT_TYPE_CREATE, {
        workspaceId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get('types')
  listTypes(@CurrentWorkspace() workspaceId: string) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.CONTENT_TYPE_LIST, { workspaceId }),
    );
  }

  @Get('types/:id')
  getType(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.CONTENT_TYPE_GET, { workspaceId, id }),
    );
  }

  @Patch('types/:id')
  updateType(
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContentTypeDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.CONTENT_TYPE_UPDATE, { workspaceId, id, dto }),
    );
  }

  @Delete('types/:id')
  deleteType(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.CONTENT_TYPE_DELETE, { workspaceId, id }),
    );
  }

  // ── Entries ───────────────────────────────────────────────────────────────

  @Post('entries')
  createEntry(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: CreateEntryDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_CREATE, {
        workspaceId,
        userId: user.userId,
        dto,
      }),
    );
  }

  @Get('entries')
  listEntries(
    @CurrentWorkspace() workspaceId: string,
    @Query() query: ListEntriesQueryDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_LIST, { workspaceId, query }),
    );
  }

  @Get('entries/:id')
  getEntry(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_GET, { workspaceId, id }),
    );
  }

  @Patch('entries/:id')
  updateEntry(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEntryDto,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_UPDATE, {
        workspaceId,
        userId: user.userId,
        id,
        dto,
      }),
    );
  }

  @Post('entries/:id/publish')
  publishEntry(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_PUBLISH, {
        workspaceId,
        userId: user.userId,
        id,
      }),
    );
  }

  @Delete('entries/:id')
  deleteEntry(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.ENTRY_DELETE, { workspaceId, id }),
    );
  }
}
