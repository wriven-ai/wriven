import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminReplyDto,
  AdminTicketListQueryDto,
  AdminUpdateTicketDto,
  CORE_PATTERNS,
  CreateTicketDto,
  CreateTicketMessageDto,
  ListTicketsQueryDto,
  PresignTicketAttachmentDto,
} from '@wriven/contracts';
import { AdminSupportService } from './admin-support.service';
import { SupportService } from './support.service';

@Controller()
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly adminSupport: AdminSupportService,
  ) {}

  // ── Tenant patterns ───────────────────────────────────────────────────────

  @MessagePattern(CORE_PATTERNS.SUPPORT_PRESIGN)
  presign(
    @Payload()
    p: { workspaceId: string; userId: string; dto: PresignTicketAttachmentDto },
  ) {
    return this.support.presign(p);
  }

  @MessagePattern(CORE_PATTERNS.SUPPORT_CREATE)
  create(
    @Payload()
    p: { workspaceId: string; userId: string; dto: CreateTicketDto },
  ) {
    return this.support.create(p);
  }

  @MessagePattern(CORE_PATTERNS.SUPPORT_LIST)
  list(
    @Payload()
    p: {
      workspaceId: string;
      userId: string;
      workspaceRole: string;
      dto: ListTicketsQueryDto;
    },
  ) {
    return this.support.list(p);
  }

  @MessagePattern(CORE_PATTERNS.SUPPORT_GET)
  get(
    @Payload()
    p: {
      workspaceId: string;
      userId: string;
      workspaceRole: string;
      id: string;
    },
  ) {
    return this.support.get(p);
  }

  @MessagePattern(CORE_PATTERNS.SUPPORT_REPLY)
  reply(
    @Payload()
    p: {
      workspaceId: string;
      userId: string;
      id: string;
      dto: CreateTicketMessageDto;
    },
  ) {
    return this.support.reply(p);
  }

  @MessagePattern(CORE_PATTERNS.SUPPORT_CLOSE)
  close(
    @Payload()
    p: { workspaceId: string; userId: string; id: string },
  ) {
    return this.support.close(p);
  }

  // ── Admin patterns ────────────────────────────────────────────────────────

  @MessagePattern(ADMIN_PATTERNS.SUPPORT_LIST)
  adminList(@Payload() query: AdminTicketListQueryDto) {
    return this.adminSupport.list(query);
  }

  @MessagePattern(ADMIN_PATTERNS.SUPPORT_GET)
  adminGet(@Payload() p: { id: string }) {
    return this.adminSupport.get(p.id);
  }

  @MessagePattern(ADMIN_PATTERNS.SUPPORT_REPLY)
  adminReply(
    @Payload()
    p: { id: string; adminUserId: string; dto: AdminReplyDto },
  ) {
    return this.adminSupport.reply(p);
  }

  @MessagePattern(ADMIN_PATTERNS.SUPPORT_UPDATE)
  adminUpdate(
    @Payload()
    p: { id: string; dto: AdminUpdateTicketDto },
  ) {
    return this.adminSupport.update(p);
  }

  @MessagePattern(ADMIN_PATTERNS.SUPPORT_METRICS)
  adminMetrics() {
    return this.adminSupport.metrics();
  }
}
