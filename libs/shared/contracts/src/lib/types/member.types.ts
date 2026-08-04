import type { ProjectRole, WorkspaceRole } from './rbac.types';

/** Minimal user info embedded in a member record. */
export interface MemberUser {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
}

export interface WorkspaceMemberView {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  user: MemberUser;
}

export interface ProjectMemberView {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
  user: MemberUser;
}
