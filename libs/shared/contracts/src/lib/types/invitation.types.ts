/**
 * Pending invitations onboard new or existing users into a workspace or project.
 * Raw token emailed once; only its hash is stored. See doc/12.
 */

export type InvitationScope = 'workspace' | 'project';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/** Dashboard view of a pending invitation (no token). */
export interface InvitationView {
  id: string;
  email: string;
  scope: InvitationScope;
  workspaceId: string;
  projectId: string | null;
  role: string;
  status: InvitationStatus;
  invitedByName: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Safe, public preview shown on the accept page (resolved from a raw token). */
export interface InvitationPreview {
  email: string;
  scope: InvitationScope;
  role: string;
  workspaceName: string;
  projectName: string | null;
  inviterName: string | null;
  /** True when no account exists for the invited email yet. */
  requiresSignup: boolean;
}
