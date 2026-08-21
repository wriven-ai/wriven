/** Tenant-side workspace activity log — written by the gateway, served by auth-service. */

/** Every action the gateway audit interceptor emits. Keep in sync with the
 * `@WorkspaceAudit` decorators on the gateway routes. */
export const WORKSPACE_LOG_ACTIONS = [
  'workspace.update',
  'member.add',
  'member.update',
  'member.remove',
  'invitation.create',
  'invitation.revoke',
  'project.create',
  'project.update',
  'project.delete',
  'billing.swap',
  'contentType.create',
  'contentType.update',
  'contentType.delete',
  'entry.create',
  'entry.update',
  'entry.delete',
  'entry.publish',
  'entry.restore',
  'media.upload',
  'media.delete',
  'apiKey.create',
  'apiKey.regenerate',
  'apiKey.revoke',
  'webhook.create',
  'webhook.update',
  'webhook.delete',
] as const;

export type WorkspaceLogAction = (typeof WORKSPACE_LOG_ACTIONS)[number];

/** Payload the gateway interceptor sends to auth-service to append a row. */
export interface WorkspaceLogWritePayload {
  workspaceId: string;
  userId: string;
  /** Present when the route was project-scoped. */
  projectId?: string | null;
  action: WorkspaceLogAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * A single workspace activity row. Actor fields resolve at read time via a
 * users join; a removed member's rows survive (userId is set-null on delete)
 * and show null actor fields. No IP — tenant-facing privacy.
 */
export interface WorkspaceLogView {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: WorkspaceLogAction;
  targetType: string | null;
  targetId: string | null;
  projectId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
