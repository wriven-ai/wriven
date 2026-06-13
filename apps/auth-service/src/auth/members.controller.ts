import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AddOrgMemberDto,
  AddWorkspaceMemberDto,
  ORG_PATTERNS,
  UpdateOrgMemberDto,
  UpdateWorkspaceMemberDto,
  WORKSPACE_PATTERNS,
} from '@wriven/contracts';
import { MembersService } from './members.service';

@Controller()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  // ── Org members ─────────────────────────────────────────────────────────────

  @MessagePattern(ORG_PATTERNS.LIST_MEMBERS)
  listOrgMembers(@Payload() p: { callerUserId: string; orgId: string }) {
    return this.members.listOrgMembers(p);
  }

  @MessagePattern(ORG_PATTERNS.ADD_MEMBER)
  addOrgMember(
    @Payload() p: { callerUserId: string; orgId: string; dto: AddOrgMemberDto },
  ) {
    return this.members.addOrgMember(p);
  }

  @MessagePattern(ORG_PATTERNS.UPDATE_MEMBER)
  updateOrgMember(
    @Payload()
    p: {
      callerUserId: string;
      orgId: string;
      targetUserId: string;
      dto: UpdateOrgMemberDto;
    },
  ) {
    return this.members.updateOrgMember(p);
  }

  @MessagePattern(ORG_PATTERNS.REMOVE_MEMBER)
  removeOrgMember(
    @Payload()
    p: { callerUserId: string; orgId: string; targetUserId: string },
  ) {
    return this.members.removeOrgMember(p);
  }

  // ── Workspace members ────────────────────────────────────────────────────────

  @MessagePattern(WORKSPACE_PATTERNS.LIST_MEMBERS)
  listWorkspaceMembers(
    @Payload() p: { callerUserId: string; workspaceId: string },
  ) {
    return this.members.listWorkspaceMembers(p);
  }

  @MessagePattern(WORKSPACE_PATTERNS.ADD_MEMBER)
  addWorkspaceMember(
    @Payload()
    p: { callerUserId: string; workspaceId: string; dto: AddWorkspaceMemberDto },
  ) {
    return this.members.addWorkspaceMember(p);
  }

  @MessagePattern(WORKSPACE_PATTERNS.UPDATE_MEMBER)
  updateWorkspaceMember(
    @Payload()
    p: {
      callerUserId: string;
      workspaceId: string;
      targetUserId: string;
      dto: UpdateWorkspaceMemberDto;
    },
  ) {
    return this.members.updateWorkspaceMember(p);
  }

  @MessagePattern(WORKSPACE_PATTERNS.REMOVE_MEMBER)
  removeWorkspaceMember(
    @Payload()
    p: { callerUserId: string; workspaceId: string; targetUserId: string },
  ) {
    return this.members.removeWorkspaceMember(p);
  }
}
