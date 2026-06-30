import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminListQueryDto,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRolesGuard } from './admin-roles.guard';

/** Cross-tenant workspace oversight (read-only in Phase B). */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@Controller('admin/workspaces')
export class AdminWorkspacesController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get()
  list(@Query() query: AdminListQueryDto) {
    return firstValueFrom(this.auth.send(ADMIN_PATTERNS.WORKSPACES_LIST, query));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return firstValueFrom(this.auth.send(ADMIN_PATTERNS.WORKSPACES_GET, { id }));
  }
}
