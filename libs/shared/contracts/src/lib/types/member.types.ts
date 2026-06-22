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
  role: string; // owner | admin | member
  createdAt: string;
  user: MemberUser;
}

export interface ProjectMemberView {
  id: string;
  projectId: string;
  userId: string;
  role: string; // admin | editor | viewer
  createdAt: string;
  user: MemberUser;
}
