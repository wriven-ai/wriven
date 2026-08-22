import { SetMetadata } from '@nestjs/common';
import type { WorkspaceLogAction } from '@wriven/contracts';
import type { Request } from 'express';

export const WS_AUDIT_KEY = 'workspaceAudit';

/** Express request augmented with the audit context handlers may set. */
export type AuditRequest = Request & { logMeta?: Record<string, unknown> };

export interface WorkspaceAuditConfig {
  /** Action verb stored on the log row, e.g. 'entry.publish', 'member.add'. */
  action: WorkspaceLogAction;
  /** Target entity type, e.g. 'entry' | 'member' | 'apiKey'. */
  target?: string;
}

/**
 * Mark a mutating workspace-scoped route for activity logging. The
 * `WorkspaceAuditInterceptor` writes a `workspace_activity_log` row after the
 * handler succeeds. The route `:id` param becomes `targetId`; set
 * `req.logMeta` in the handler for extra metadata.
 */
export const WorkspaceAudit = (action: WorkspaceLogAction, target?: string) =>
  SetMetadata(WS_AUDIT_KEY, { action, target } satisfies WorkspaceAuditConfig);
