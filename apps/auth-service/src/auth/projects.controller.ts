import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  PROJECT_PATTERNS,
  UpdateProjectDto,
  UpdateProjectMemberDto,
} from '@wriven/contracts';
import { ProjectsService } from './projects.service';

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  // ── Project CRUD ────────────────────────────────────────────────────────────

  @MessagePattern(PROJECT_PATTERNS.CREATE_PROJECT)
  create(
    @Payload()
    p: { callerUserId: string; workspaceId: string; dto: CreateProjectDto },
  ) {
    return this.projects.create(p);
  }

  @MessagePattern(PROJECT_PATTERNS.GET_PROJECT)
  get(@Payload() p: { callerUserId: string; projectId: string }) {
    return this.projects.get(p);
  }

  @MessagePattern(PROJECT_PATTERNS.LIST_PROJECTS)
  list(@Payload() p: { callerUserId: string; workspaceId: string }) {
    return this.projects.list(p);
  }

  @MessagePattern(PROJECT_PATTERNS.UPDATE_PROJECT)
  update(
    @Payload()
    p: { callerUserId: string; projectId: string; dto: UpdateProjectDto },
  ) {
    return this.projects.update(p);
  }

  @MessagePattern(PROJECT_PATTERNS.DELETE_PROJECT)
  remove(@Payload() p: { callerUserId: string; projectId: string }) {
    return this.projects.remove(p);
  }

  // ── Project members ─────────────────────────────────────────────────────────

  @MessagePattern(PROJECT_PATTERNS.LIST_MEMBERS)
  listMembers(@Payload() p: { callerUserId: string; projectId: string }) {
    return this.projects.listMembers(p);
  }

  @MessagePattern(PROJECT_PATTERNS.ADD_MEMBER)
  addMember(
    @Payload()
    p: { callerUserId: string; projectId: string; dto: AddProjectMemberDto },
  ) {
    return this.projects.addMember(p);
  }

  @MessagePattern(PROJECT_PATTERNS.UPDATE_MEMBER)
  updateMember(
    @Payload()
    p: {
      callerUserId: string;
      projectId: string;
      targetUserId: string;
      dto: UpdateProjectMemberDto;
    },
  ) {
    return this.projects.updateMember(p);
  }

  @MessagePattern(PROJECT_PATTERNS.REMOVE_MEMBER)
  removeMember(
    @Payload()
    p: { callerUserId: string; projectId: string; targetUserId: string },
  ) {
    return this.projects.removeMember(p);
  }
}
