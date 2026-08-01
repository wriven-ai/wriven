import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { INVITATION_PATTERNS, InvitationScope } from '@wriven/contracts';
import { InvitationsService } from './invitations.service';

@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @MessagePattern(INVITATION_PATTERNS.CREATE)
  create(
    @Payload()
    p: {
      callerUserId: string;
      scope: InvitationScope;
      workspaceId?: string;
      projectId?: string;
      email: string;
      role: string;
    },
  ) {
    return this.invitations.create(p);
  }

  @MessagePattern(INVITATION_PATTERNS.LIST)
  list(
    @Payload()
    p: {
      callerUserId: string;
      scope: InvitationScope;
      workspaceId?: string;
      projectId?: string;
    },
  ) {
    return this.invitations.list(p);
  }

  @MessagePattern(INVITATION_PATTERNS.REVOKE)
  revoke(@Payload() p: { callerUserId: string; id: string }) {
    return this.invitations.revoke(p);
  }

  @MessagePattern(INVITATION_PATTERNS.RESEND)
  resend(@Payload() p: { callerUserId: string; id: string }) {
    return this.invitations.resend(p);
  }

  @MessagePattern(INVITATION_PATTERNS.PREVIEW)
  preview(@Payload() p: { token: string }) {
    return this.invitations.preview(p);
  }

  @MessagePattern(INVITATION_PATTERNS.ACCEPT)
  accept(@Payload() p: { token: string; userId: string }) {
    return this.invitations.accept(p);
  }
}
