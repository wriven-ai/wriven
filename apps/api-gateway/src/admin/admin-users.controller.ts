import {
  Body,
  Controller,
  Delete,
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
  AdminListQueryDto,
  AdminUpdateUserDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRoles } from './admin-roles.decorator';
import { AdminRolesGuard } from './admin-roles.guard';
import { Audit } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';

/** Cross-tenant user oversight. Read = any admin; writes gated + audited. */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: AdminListQueryDto) {
    return firstValueFrom(this.auth.send(ADMIN_PATTERNS.USERS_LIST, query));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return firstValueFrom(this.auth.send(ADMIN_PATTERNS.USERS_GET, { id }));
  }

  @AdminRoles('admin', 'moderator')
  @Audit('user.update', 'user')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return firstValueFrom(
      this.auth.send(ADMIN_PATTERNS.USERS_UPDATE, { id, dto }),
    );
  }

  @AdminRoles('admin')
  @Audit('user.delete', 'user')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return firstValueFrom(this.auth.send(ADMIN_PATTERNS.USERS_DELETE, { id }));
  }
}
