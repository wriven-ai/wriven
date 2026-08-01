import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminContentQueryDto,
  AdminTakedownDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRoles } from './admin-roles.decorator';
import { AdminRolesGuard } from './admin-roles.guard';
import { Audit } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';

/** Cross-tenant content moderation. Read = any admin; takedown gated + audited. */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('admin/content')
export class AdminContentController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: AdminContentQueryDto) {
    return firstValueFrom(this.core.send(ADMIN_PATTERNS.CONTENT_LIST, query));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return firstValueFrom(this.core.send(ADMIN_PATTERNS.CONTENT_GET, { id }));
  }

  @AdminRoles('admin', 'moderator')
  @Audit('content.takedown', 'entry')
  @Patch(':id')
  takedown(@Param('id') id: string, @Body() dto: AdminTakedownDto) {
    return firstValueFrom(
      this.core.send(ADMIN_PATTERNS.CONTENT_TAKEDOWN, { id, dto }),
    );
  }
}
