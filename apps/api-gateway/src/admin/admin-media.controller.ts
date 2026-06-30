import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminScopedQueryDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRoles } from './admin-roles.decorator';
import { AdminRolesGuard } from './admin-roles.guard';
import { Audit } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';

/** Cross-tenant media oversight. Read = any admin; purge gated + audited. */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('admin/media')
export class AdminMediaController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: AdminScopedQueryDto) {
    return firstValueFrom(this.core.send(ADMIN_PATTERNS.MEDIA_LIST, query));
  }

  @Get('usage')
  usage() {
    return firstValueFrom(this.core.send(ADMIN_PATTERNS.MEDIA_USAGE, {}));
  }

  @AdminRoles('admin', 'moderator')
  @Audit('media.purge', 'media')
  @Delete(':id')
  purge(@Param('id') id: string) {
    return firstValueFrom(this.core.send(ADMIN_PATTERNS.MEDIA_PURGE, { id }));
  }
}
