import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AddWorkspaceMemberDto,
  UpdateWorkspaceMemberDto,
  WORKSPACE_PATTERNS,
} from '@wriven/contracts';
import { MembersService } from './members.service';

@Controller()
export class MembersController {
  constructor(private readonly members: MembersService) {}

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
