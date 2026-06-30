import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdminListQueryDto,
  AdminRole,
  AdminView,
  CreateAdminDto,
  Paginated,
  UpdateAdminDto,
} from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import * as bcrypt from 'bcrypt';
import { desc, eq, ilike, or } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { adminUsers } = schema;
type AdminRow = typeof adminUsers.$inferSelect;

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly config: ConfigService,
  ) {}

  async list(query: AdminListQueryDto): Promise<Paginated<AdminView>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.q
      ? or(
          ilike(adminUsers.email, `%${query.q}%`),
          ilike(adminUsers.name, `%${query.q}%`),
        )
      : undefined;

    const [rows, total] = await Promise.all([
      this.db.query.adminUsers.findMany({
        where,
        orderBy: desc(adminUsers.createdAt),
        limit,
        offset: (page - 1) * limit,
      }),
      this.db.$count(adminUsers, where),
    ]);

    return { items: rows.map(this.toView), page, limit, total };
  }

  async create(dto: CreateAdminDto): Promise<AdminView> {
    const existing = await this.db.query.adminUsers.findFirst({
      where: eq(adminUsers.email, dto.email),
      columns: { id: true },
    });
    if (existing) {
      throw rpcError('CONFLICT', 'An admin with this email already exists.');
    }
    const rounds = Number(this.config.get('BCRYPT_ROUNDS', 12));
    const passwordHash = await bcrypt.hash(dto.password, rounds);
    const [admin] = await this.db
      .insert(adminUsers)
      .values({
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: dto.role,
      })
      .returning();
    return this.toView(admin);
  }

  async update(payload: {
    id: string;
    dto: UpdateAdminDto;
  }): Promise<AdminView> {
    const patch: Partial<AdminRow> = {};
    if (payload.dto.role !== undefined) patch.role = payload.dto.role;
    if (payload.dto.active !== undefined) patch.active = payload.dto.active;

    const [admin] = await this.db
      .update(adminUsers)
      .set(patch)
      .where(eq(adminUsers.id, payload.id))
      .returning();
    if (!admin) {
      throw rpcError('NOT_FOUND', 'Admin not found.');
    }
    return this.toView(admin);
  }

  async remove(payload: { id: string }): Promise<{ success: true }> {
    const [deleted] = await this.db
      .delete(adminUsers)
      .where(eq(adminUsers.id, payload.id))
      .returning({ id: adminUsers.id });
    if (!deleted) {
      throw rpcError('NOT_FOUND', 'Admin not found.');
    }
    return { success: true };
  }

  private toView(a: AdminRow): AdminView {
    return {
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role as AdminRole,
      active: a.active,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
