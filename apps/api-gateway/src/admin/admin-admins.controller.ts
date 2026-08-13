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
  UseInterceptors,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import * as contracts from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRoles } from './admin-roles.decorator';
import { AdminRolesGuard } from './admin-roles.guard';
import { Audit } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';
import { CurrentAdmin } from './current-admin.decorator';

/** Manage platform admins. `admin` role only. */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@UseInterceptors(AuditInterceptor)
@AdminRoles('admin')
@Controller('admin/admins')
export class AdminAdminsController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: contracts.AdminListQueryDto) {
    return firstValueFrom(this.auth.send(contracts.ADMIN_PATTERNS.ADMINS_LIST, query));
  }

  @Audit('admin.create', 'admin_user')
  @Post()
  create(@Body() dto: contracts.CreateAdminDto) {
    return firstValueFrom(this.auth.send(contracts.ADMIN_PATTERNS.ADMINS_CREATE, dto));
  }

  @Audit('admin.update', 'admin_user')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: contracts.UpdateAdminDto,
    @CurrentAdmin() admin: contracts.AdminAuthUser,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.ADMIN_PATTERNS.ADMINS_UPDATE, {
        id,
        dto,
        actingAdminId: admin.adminUserId,
      }),
    );
  }

  @Audit('admin.delete', 'admin_user')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentAdmin() admin: contracts.AdminAuthUser) {
    return firstValueFrom(
      this.auth.send(contracts.ADMIN_PATTERNS.ADMINS_DELETE, {
        id,
        actingAdminId: admin.adminUserId,
      }),
    );
  }
}
