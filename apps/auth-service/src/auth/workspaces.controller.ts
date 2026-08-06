import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WORKSPACE_PATTERNS,
} from '@wriven/contracts';
import { WorkspacesService } from './workspaces.service';

@Controller()
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @MessagePattern(WORKSPACE_PATTERNS.CREATE_WORKSPACE)
  create(@Payload() p: { userId: string; dto: CreateWorkspaceDto }) {
    return this.workspaces.create(p);
  }

  @MessagePattern(WORKSPACE_PATTERNS.GET_WORKSPACE)
  get(@Payload() p: { callerUserId: string; workspaceId: string }) {
    return this.workspaces.get(p);
  }

  @MessagePattern(WORKSPACE_PATTERNS.LIST_WORKSPACES)
  list(@Payload() p: { userId: string }) {
    return this.workspaces.list(p);
  }

  @MessagePattern(WORKSPACE_PATTERNS.UPDATE_WORKSPACE)
  update(
    @Payload()
    p: { callerUserId: string; workspaceId: string; dto: UpdateWorkspaceDto },
  ) {
    return this.workspaces.update(p);
  }

  @MessagePattern(WORKSPACE_PATTERNS.DELETE_WORKSPACE)
  remove(@Payload() p: { callerUserId: string; workspaceId: string }) {
    return this.workspaces.remove(p);
  }

  /** Workspace tenancy counts (projects + members). See specs/17. */
  @MessagePattern(WORKSPACE_PATTERNS.STATS)
  stats(@Payload() p: { userId: string; workspaceId: string }) {
    return this.workspaces.stats(p);
  }
}
