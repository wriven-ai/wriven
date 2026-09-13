import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  CreatePlanDto,
  SERVICE_TOKENS,
  UpdatePlanDto,
} from '@wriven/contracts';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRoles } from './admin-roles.decorator';
import { AdminRolesGuard } from './admin-roles.guard';
import { Audit } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';

import { sendWithTimeout } from '../common/send-with-timeout';
/** Plan definitions. Read = any admin; create/update = `admin` only, audited. */
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('admin/plans')
export class AdminPlansController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get()
  list() {
    return sendWithTimeout(this.auth, ADMIN_PATTERNS.PLANS_LIST, {});
  }

  @AdminRoles('admin')
  @Audit('plan.create', 'plan')
  @Post()
  create(@Body() dto: CreatePlanDto) {
    return sendWithTimeout(this.auth, ADMIN_PATTERNS.PLANS_CREATE, dto);
  }

  @AdminRoles('admin')
  @Audit('plan.update', 'plan')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return sendWithTimeout(this.auth, ADMIN_PATTERNS.PLANS_UPDATE, { id, dto });
  }
}
