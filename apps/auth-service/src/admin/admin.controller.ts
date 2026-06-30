import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminListQueryDto,
  AdminLoginDto,
  AdminUpdateUserDto,
  AuditWritePayload,
  CreateAdminDto,
  LogoutPayload,
  RefreshPayload,
  UpdateAdminDto,
} from '@wriven/contracts';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminTenancyService } from './admin-tenancy.service';
import { AdminUsersService } from './admin-users.service';

/** TCP surface for the platform admin panel (auth-service side). */
@Controller()
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly admins: AdminUsersService,
    private readonly audit: AdminAuditService,
    private readonly metrics: AdminMetricsService,
    private readonly tenancy: AdminTenancyService,
  ) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  @MessagePattern(ADMIN_PATTERNS.LOGIN)
  login(@Payload() dto: AdminLoginDto) {
    return this.auth.login(dto);
  }

  @MessagePattern(ADMIN_PATTERNS.REFRESH)
  refresh(@Payload() payload: RefreshPayload) {
    return this.auth.refresh(payload);
  }

  @MessagePattern(ADMIN_PATTERNS.LOGOUT)
  logout(@Payload() payload: LogoutPayload) {
    return this.auth.logout(payload);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_BY_ID)
  getById(@Payload() payload: { adminUserId: string }) {
    return this.auth.getById(payload);
  }

  // ── admin_users management ──────────────────────────────────────────────────

  @MessagePattern(ADMIN_PATTERNS.ADMINS_LIST)
  listAdmins(@Payload() query: AdminListQueryDto) {
    return this.admins.list(query);
  }

  @MessagePattern(ADMIN_PATTERNS.ADMINS_CREATE)
  createAdmin(@Payload() dto: CreateAdminDto) {
    return this.admins.create(dto);
  }

  @MessagePattern(ADMIN_PATTERNS.ADMINS_UPDATE)
  updateAdmin(@Payload() payload: { id: string; dto: UpdateAdminDto }) {
    return this.admins.update(payload);
  }

  @MessagePattern(ADMIN_PATTERNS.ADMINS_DELETE)
  deleteAdmin(@Payload() payload: { id: string }) {
    return this.admins.remove(payload);
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  @MessagePattern(ADMIN_PATTERNS.AUDIT_WRITE)
  writeAudit(@Payload() payload: AuditWritePayload) {
    return this.audit.write(payload);
  }

  @MessagePattern(ADMIN_PATTERNS.AUDIT_LIST)
  listAudit(@Payload() query: AdminListQueryDto) {
    return this.audit.list(query);
  }

  // ── Metrics ─────────────────────────────────────────────────────────────────

  @MessagePattern(ADMIN_PATTERNS.METRICS_AUTH)
  authMetrics() {
    return this.metrics.auth();
  }

  // ── Tenant oversight ────────────────────────────────────────────────────────

  @MessagePattern(ADMIN_PATTERNS.USERS_LIST)
  listUsers(@Payload() query: AdminListQueryDto) {
    return this.tenancy.listUsers(query);
  }

  @MessagePattern(ADMIN_PATTERNS.USERS_GET)
  getUser(@Payload() payload: { id: string }) {
    return this.tenancy.getUser(payload);
  }

  @MessagePattern(ADMIN_PATTERNS.USERS_UPDATE)
  updateUser(@Payload() payload: { id: string; dto: AdminUpdateUserDto }) {
    return this.tenancy.updateUser(payload);
  }

  @MessagePattern(ADMIN_PATTERNS.USERS_DELETE)
  deleteUser(@Payload() payload: { id: string }) {
    return this.tenancy.deleteUser(payload);
  }

  @MessagePattern(ADMIN_PATTERNS.WORKSPACES_LIST)
  listWorkspaces(@Payload() query: AdminListQueryDto) {
    return this.tenancy.listWorkspaces(query);
  }

  @MessagePattern(ADMIN_PATTERNS.WORKSPACES_GET)
  getWorkspace(@Payload() payload: { id: string }) {
    return this.tenancy.getWorkspace(payload);
  }

  @MessagePattern(ADMIN_PATTERNS.PROJECTS_LIST)
  listProjects(@Payload() query: AdminListQueryDto) {
    return this.tenancy.listProjects(query);
  }

  @MessagePattern(ADMIN_PATTERNS.PROJECTS_GET)
  getProject(@Payload() payload: { id: string }) {
    return this.tenancy.getProject(payload);
  }

  @MessagePattern(ADMIN_PATTERNS.PROJECTS_DELETE)
  deleteProject(@Payload() payload: { id: string }) {
    return this.tenancy.deleteProject(payload);
  }
}
