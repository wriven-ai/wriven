import { Inject, Injectable } from '@nestjs/common';
import {
  AdminReplyDto,
  AdminTicketListQueryDto,
  AdminUpdateTicketDto,
  Paginated,
  SupportAttachmentView,
  SupportMessageView,
  SupportMetrics,
  SupportTicketDetail,
  SupportTicketRow,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
import { StorageService } from '../storage/storage.service';

const {
  supportTickets,
  supportTicketMessages,
  supportTicketAttachments,
} = schema;

type TicketRow = typeof supportTickets.$inferSelect;
type MessageRow = typeof supportTicketMessages.$inferSelect;
type AttachmentRow = typeof supportTicketAttachments.$inferSelect;

@Injectable()
export class AdminSupportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly storage: StorageService,
  ) {}

  async list(
    query: AdminTicketListQueryDto,
  ): Promise<Paginated<SupportTicketRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;

    const conditions = [isNull(supportTickets.deletedAt)];
    if (query.status) conditions.push(eq(supportTickets.status, query.status));
    if (query.priority) conditions.push(eq(supportTickets.priority, query.priority));
    if (query.scopeType) conditions.push(eq(supportTickets.scopeType, query.scopeType));
    if (query.workspaceId) conditions.push(eq(supportTickets.workspaceId, query.workspaceId));
    if (query.assignedAdminId) {
      conditions.push(eq(supportTickets.assignedAdminId, query.assignedAdminId));
    }
    if (query.unassigned) {
      conditions.push(isNull(supportTickets.assignedAdminId));
    }
    if (query.q) {
      const term = `%${query.q}%`;
      conditions.push(
        or(
          ilike(supportTickets.subject, term),
          sql`${supportTickets.number}::text ilike ${term}`,
        )!,
      );
    }

    const where = and(...conditions);
    const total = await this.db.$count(supportTickets, where);
    const rows = await this.db.query.supportTickets.findMany({
      where,
      orderBy: desc(supportTickets.createdAt),
      limit,
      offset: (page - 1) * limit,
    });

    return { items: rows.map((r) => this.toRow(r)), page, limit, total };
  }

  async get(id: string): Promise<SupportTicketDetail> {
    const ticket = await this.db.query.supportTickets.findFirst({
      where: and(
        eq(supportTickets.id, id),
        isNull(supportTickets.deletedAt),
      ),
    });
    if (!ticket) throw rpcError('NOT_FOUND', 'Support ticket not found.');
    return this.buildDetail(ticket, true);
  }

  async reply(p: {
    id: string;
    adminUserId: string;
    dto: AdminReplyDto;
  }): Promise<SupportTicketDetail> {
    const ticket = await this.db.query.supportTickets.findFirst({
      where: and(
        eq(supportTickets.id, p.id),
        isNull(supportTickets.deletedAt),
      ),
    });
    if (!ticket) throw rpcError('NOT_FOUND', 'Support ticket not found.');
    if (ticket.status === 'closed') {
      throw rpcError('CONFLICT', 'Cannot reply to a closed ticket.');
    }

    const isNote = p.dto.internalNote === true;

    const [msg] = await this.db
      .insert(supportTicketMessages)
      .values({
        ticketId: ticket.id,
        authorType: 'admin',
        authorId: p.adminUserId,
        body: p.dto.body,
        isInternalNote: isNote,
      })
      .returning();

    if (p.dto.attachmentKeys?.length) {
      await this.db.insert(supportTicketAttachments).values(
        p.dto.attachmentKeys.map((r2Key) => ({
          ticketId: ticket.id,
          messageId: msg.id,
          r2Key,
          uploadedBy: p.adminUserId,
        })),
      );
    }

    const updates: Partial<typeof supportTickets.$inferInsert> = {
      lastReplyAt: new Date(),
      lastReplyBy: 'admin',
    };
    if (!isNote) {
      updates.status = 'pending';
      if (!ticket.firstRespondedAt) {
        updates.firstRespondedAt = new Date();
      }
    }

    const [updated] = await this.db
      .update(supportTickets)
      .set(updates)
      .where(eq(supportTickets.id, ticket.id))
      .returning();

    return this.buildDetail(updated, true);
  }

  async update(p: {
    id: string;
    dto: AdminUpdateTicketDto;
  }): Promise<SupportTicketDetail> {
    const ticket = await this.db.query.supportTickets.findFirst({
      where: and(
        eq(supportTickets.id, p.id),
        isNull(supportTickets.deletedAt),
      ),
    });
    if (!ticket) throw rpcError('NOT_FOUND', 'Support ticket not found.');

    const updates: Partial<typeof supportTickets.$inferInsert> = {};
    if (p.dto.status !== undefined) {
      updates.status = p.dto.status;
      if (p.dto.status === 'resolved') updates.resolvedAt = new Date();
      if (p.dto.status === 'closed') updates.closedAt = new Date();
    }
    if (p.dto.priority !== undefined) updates.priority = p.dto.priority;
    if ('assignedAdminId' in p.dto) {
      updates.assignedAdminId = p.dto.assignedAdminId ?? null;
    }

    const [updated] = await this.db
      .update(supportTickets)
      .set(updates)
      .where(eq(supportTickets.id, ticket.id))
      .returning();

    return this.buildDetail(updated, true);
  }

  async metrics(): Promise<SupportMetrics> {
    const [row] = await this.db
      .select({
        open: sql<number>`count(*) filter (where ${supportTickets.status} = 'open')`,
        pending: sql<number>`count(*) filter (where ${supportTickets.status} = 'pending')`,
        resolved: sql<number>`count(*) filter (where ${supportTickets.status} = 'resolved')`,
        closed: sql<number>`count(*) filter (where ${supportTickets.status} = 'closed')`,
        unassigned: sql<number>`count(*) filter (where ${supportTickets.assignedAdminId} is null and ${supportTickets.status} != 'closed')`,
        total: count(),
      })
      .from(supportTickets)
      .where(isNull(supportTickets.deletedAt));

    return {
      open: Number(row?.open ?? 0),
      pending: Number(row?.pending ?? 0),
      resolved: Number(row?.resolved ?? 0),
      closed: Number(row?.closed ?? 0),
      unassigned: Number(row?.unassigned ?? 0),
      total: Number(row?.total ?? 0),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async buildDetail(
    ticket: TicketRow,
    includeInternalNotes: boolean,
  ): Promise<SupportTicketDetail> {
    const msgs = await this.db.query.supportTicketMessages.findMany({
      where: eq(supportTicketMessages.ticketId, ticket.id),
      orderBy: sql`${supportTicketMessages.createdAt} asc`,
      with: { attachments: true },
    });

    const ticketAttachments =
      await this.db.query.supportTicketAttachments.findMany({
        where: and(
          eq(supportTicketAttachments.ticketId, ticket.id),
          isNull(supportTicketAttachments.messageId),
        ),
      });

    const filteredMsgs = includeInternalNotes
      ? msgs
      : msgs.filter((m) => !m.isInternalNote);

    return {
      ...this.toRow(ticket),
      workspaceId: ticket.workspaceId,
      authorId: ticket.authorId,
      description: ticket.description,
      attachments: ticketAttachments.map((a) => this.toAttachmentView(a)),
      messages: filteredMsgs.map((m) =>
        this.toMessageView(m, m.attachments, includeInternalNotes),
      ),
    };
  }

  private toRow(r: TicketRow): SupportTicketRow {
    return {
      id: r.id,
      number: r.number,
      subject: r.subject,
      scopeType: r.scopeType as SupportTicketRow['scopeType'],
      scopeProjectId: r.scopeProjectId,
      status: r.status as SupportTicketRow['status'],
      priority: r.priority as SupportTicketRow['priority'],
      lastReplyAt: r.lastReplyAt?.toISOString() ?? null,
      lastReplyBy: r.lastReplyBy as SupportTicketRow['lastReplyBy'],
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toAttachmentView(a: AttachmentRow): SupportAttachmentView {
    return {
      id: a.id,
      url: this.storage.publicUrl(a.r2Key),
      mime: a.mime,
      sizeBytes: a.sizeBytes,
      originalFilename: a.originalFilename,
    };
  }

  private toMessageView(
    m: MessageRow,
    attachments: AttachmentRow[],
    includeNote: boolean,
  ): SupportMessageView {
    const view: SupportMessageView = {
      id: m.id,
      authorType: m.authorType as 'user' | 'admin',
      authorId: m.authorId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      attachments: attachments.map((a) => this.toAttachmentView(a)),
    };
    if (includeNote) view.isInternalNote = m.isInternalNote;
    return view;
  }
}
