import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CreateTicketDto,
  CreateTicketMessageDto,
  ListTicketsQueryDto,
  PresignTicketAttachmentDto,
  SupportAttachmentView,
  SupportMessageView,
  SupportPresignResult,
  SupportTicketDetail,
  SupportTicketRow,
  Paginated,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
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

const MAX_OPEN_PER_WORKSPACE = 20;
const SUPPORT_KEY_PREFIX = (workspaceId: string) => `support/${workspaceId}/`;

const OWNER_ADMIN_ROLES = new Set(['owner', 'admin']);

@Injectable()
export class SupportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly storage: StorageService,
  ) {}

  async presign(p: {
    workspaceId: string;
    userId: string;
    dto: PresignTicketAttachmentDto;
  }): Promise<SupportPresignResult> {
    if (!p.dto.contentType.startsWith('image/')) {
      throw rpcError('VALIDATION_ERROR', 'Only image attachments are allowed.');
    }
    const maxBytes = 5 * 1024 * 1024;
    if (p.dto.size > maxBytes) {
      throw rpcError('VALIDATION_ERROR', 'Image must be under 5 MB.');
    }
    const ext = p.dto.filename.includes('.')
      ? p.dto.filename.slice(p.dto.filename.lastIndexOf('.') + 1).toLowerCase()
      : '';
    const key = `support/${p.workspaceId}/${randomUUID()}${ext ? `.${ext}` : ''}`;
    const uploadUrl = await this.storage.presignUpload(key, p.dto.contentType, {
      contentLength: p.dto.size,
    });
    return { uploadUrl, key };
  }

  async create(p: {
    workspaceId: string;
    userId: string;
    dto: CreateTicketDto;
  }): Promise<SupportTicketDetail> {
    const openCount = await this.db.$count(
      supportTickets,
      and(
        eq(supportTickets.workspaceId, p.workspaceId),
        eq(supportTickets.status, 'open'),
        isNull(supportTickets.deletedAt),
      ),
    );
    if (openCount >= MAX_OPEN_PER_WORKSPACE) {
      throw rpcError(
        'CONFLICT',
        `Too many open tickets (max ${MAX_OPEN_PER_WORKSPACE}). Close or resolve existing tickets first.`,
      );
    }

    const keys = p.dto.attachmentKeys ?? [];
    this.assertKeyPrefix(keys, p.workspaceId);

    const [ticket] = await this.db
      .insert(supportTickets)
      .values({
        workspaceId: p.workspaceId,
        authorId: p.userId,
        subject: p.dto.subject,
        description: p.dto.description,
        scopeType: p.dto.scopeType ?? 'general',
        scopeProjectId: p.dto.scopeProjectId ?? null,
      })
      .returning();

    if (keys.length > 0) {
      await this.db.insert(supportTicketAttachments).values(
        keys.map((r2Key) => ({
          ticketId: ticket.id,
          messageId: null,
          r2Key,
          uploadedBy: p.userId,
        })),
      );
    }

    return this.buildDetail(ticket, false);
  }

  async list(p: {
    workspaceId: string;
    userId: string;
    workspaceRole: string;
    dto: ListTicketsQueryDto;
  }): Promise<Paginated<SupportTicketRow>> {
    const page = p.dto.page ?? 1;
    const limit = p.dto.limit ?? 20;
    const isPrivileged = OWNER_ADMIN_ROLES.has(p.workspaceRole);

    const conditions = [
      eq(supportTickets.workspaceId, p.workspaceId),
      isNull(supportTickets.deletedAt),
    ];
    if (!isPrivileged) {
      conditions.push(eq(supportTickets.authorId, p.userId));
    }
    if (p.dto.status) {
      conditions.push(eq(supportTickets.status, p.dto.status));
    }
    if (p.dto.scopeType) {
      conditions.push(eq(supportTickets.scopeType, p.dto.scopeType));
    }

    const where = and(...conditions);
    const total = await this.db.$count(supportTickets, where);
    const rows = await this.db.query.supportTickets.findMany({
      where,
      orderBy: desc(supportTickets.createdAt),
      limit,
      offset: (page - 1) * limit,
    });

    return {
      items: rows.map((r) => this.toRow(r)),
      page,
      limit,
      total,
    };
  }

  async get(p: {
    workspaceId: string;
    userId: string;
    workspaceRole: string;
    id: string;
  }): Promise<SupportTicketDetail> {
    const ticket = await this.requireTicket(p.workspaceId, p.id);
    const isPrivileged = OWNER_ADMIN_ROLES.has(p.workspaceRole);
    if (!isPrivileged && ticket.authorId !== p.userId) {
      throw rpcError('FORBIDDEN', 'Access denied.');
    }
    return this.buildDetail(ticket, false);
  }

  async reply(p: {
    workspaceId: string;
    userId: string;
    id: string;
    dto: CreateTicketMessageDto;
  }): Promise<SupportTicketDetail> {
    const ticket = await this.requireTicket(p.workspaceId, p.id);

    if (ticket.status === 'closed') {
      throw rpcError(
        'CONFLICT',
        'This ticket is closed. Please open a new ticket.',
      );
    }

    const keys = p.dto.attachmentKeys ?? [];
    this.assertKeyPrefix(keys, p.workspaceId);

    const newStatus =
      ticket.status === 'pending' || ticket.status === 'resolved'
        ? 'open'
        : ticket.status;

    const [msg] = await this.db
      .insert(supportTicketMessages)
      .values({
        ticketId: ticket.id,
        authorType: 'user',
        authorId: p.userId,
        body: p.dto.body,
        isInternalNote: false,
      })
      .returning();

    if (keys.length > 0) {
      await this.db.insert(supportTicketAttachments).values(
        keys.map((r2Key) => ({
          ticketId: ticket.id,
          messageId: msg.id,
          r2Key,
          uploadedBy: p.userId,
        })),
      );
    }

    await this.db
      .update(supportTickets)
      .set({
        status: newStatus,
        lastReplyAt: new Date(),
        lastReplyBy: 'user',
      })
      .where(eq(supportTickets.id, ticket.id));

    return this.buildDetail({ ...ticket, status: newStatus }, false);
  }

  async close(p: {
    workspaceId: string;
    userId: string;
    id: string;
  }): Promise<SupportTicketDetail> {
    const ticket = await this.requireTicket(p.workspaceId, p.id);
    if (ticket.authorId !== p.userId) {
      throw rpcError('FORBIDDEN', 'Only the ticket author can close it.');
    }
    if (ticket.status === 'closed') {
      return this.buildDetail(ticket, false);
    }

    const [updated] = await this.db
      .update(supportTickets)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(supportTickets.id, ticket.id))
      .returning();

    return this.buildDetail(updated, false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async requireTicket(
    workspaceId: string,
    id: string,
  ): Promise<TicketRow> {
    const ticket = await this.db.query.supportTickets.findFirst({
      where: and(
        eq(supportTickets.id, id),
        eq(supportTickets.workspaceId, workspaceId),
        isNull(supportTickets.deletedAt),
      ),
    });
    if (!ticket) throw rpcError('NOT_FOUND', 'Support ticket not found.');
    return ticket;
  }

  private assertKeyPrefix(keys: string[], workspaceId: string): void {
    const prefix = SUPPORT_KEY_PREFIX(workspaceId);
    for (const key of keys) {
      if (!key.startsWith(prefix)) {
        throw rpcError('VALIDATION_ERROR', 'Invalid attachment key.');
      }
    }
  }

  private async buildDetail(
    ticket: TicketRow,
    includeInternalNotes: boolean,
  ): Promise<SupportTicketDetail> {
    const msgs = await this.db.query.supportTicketMessages.findMany({
      where: eq(supportTicketMessages.ticketId, ticket.id),
      orderBy: sql`${supportTicketMessages.createdAt} asc`,
      with: { attachments: true },
    });

    const ticketAttachments = await this.db.query.supportTicketAttachments.findMany({
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
      messages: filteredMsgs.map((m) => this.toMessageView(m, m.attachments)),
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
  ): SupportMessageView {
    return {
      id: m.id,
      authorType: m.authorType as 'user' | 'admin',
      authorId: m.authorId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      attachments: attachments.map((a) => this.toAttachmentView(a)),
    };
  }
}
