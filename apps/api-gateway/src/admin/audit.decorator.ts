import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'auditMeta';

export interface AuditConfig {
  /** Action verb stored on the log row, e.g. 'admin.create', 'user.suspend'. */
  action: string;
  /** Target entity type, e.g. 'admin_user' | 'user' | 'workspace'. */
  target?: string;
}

/**
 * Mark a mutating admin route for audit logging. The `AuditInterceptor` writes
 * an `admin_audit_log` row after the handler succeeds. The route param `:id`
 * becomes `targetId`; set `req.auditMeta` in the handler for extra metadata.
 */
export const Audit = (action: string, target?: string) =>
  SetMetadata(AUDIT_KEY, { action, target } satisfies AuditConfig);
