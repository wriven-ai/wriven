import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthUser,
  SERVICE_TOKENS,
  WORKSPACE_PATTERNS,
} from '@wriven/contracts';
import type { WorkspaceLogWritePayload } from '@wriven/contracts';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import {
  WS_AUDIT_KEY,
  type WorkspaceAuditConfig,
} from './workspace-audit.decorator';

/**
 * Writes a `workspace_activity_log` entry after any `@WorkspaceAudit(...)`-marked
 * route succeeds. Fire-and-forget — a logging failure never fails the request,
 * but is logged for follow-up. Bound per-controller (same pattern as the admin
 * AuditInterceptor), so it sees the raw handler result before the global
 * ResponseInterceptor wraps it.
 */
@Injectable()
export class WorkspaceAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('WorkspaceAudit');

  constructor(
    private readonly reflector: Reflector,
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<WorkspaceAuditConfig | undefined>(
      WS_AUDIT_KEY,
      context.getHandler(),
    );
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<
      Request & {
        user?: AuthUser;
        workspaceId?: string;
        projectId?: string;
        logMeta?: Record<string, unknown>;
        params: Record<string, string>;
      }
    >();

    return next.handle().pipe(
      tap((result) => {
        const user = req.user;
        if (!user) return;
        // Workspace comes from the WorkspaceGuard header context, the
        // `:workspaceId` path param, or the result (a created workspace in
        // `POST /workspaces`, or `workspaceId` on project views/deletes).
        const resultWorkspaceId =
          result && typeof result === 'object' && 'workspace' in result
            ? (result as { workspace?: { id?: string } }).workspace?.id
            : undefined;
        const resultWorkspaceField =
          result && typeof result === 'object' && 'workspaceId' in result
            ? (result as { workspaceId?: unknown }).workspaceId
            : undefined;
        const workspaceId =
          req.workspaceId ??
          req.params?.['workspaceId'] ??
          resultWorkspaceId ??
          (typeof resultWorkspaceField === 'string'
            ? resultWorkspaceField
            : undefined);
        if (!workspaceId) return;
        const params = req.params ?? {};
        // Prefer route params (:id generic, :userId member routes, :projectId
        // project routes); fall back to the created entity's id from the
        // handler result (creates have no :id param).
        const resultId =
          result && typeof result === 'object' && 'id' in result
            ? (result as { id?: unknown }).id
            : undefined;
        const targetId =
          params['id'] ??
          params['userId'] ??
          params['projectId'] ??
          (typeof resultId === 'string' || typeof resultId === 'number'
            ? String(resultId)
            : null);
        const resultProjectId =
          result && typeof result === 'object' && 'projectId' in result
            ? ((result as { projectId?: unknown }).projectId as string | null)
            : undefined;
        const payload: WorkspaceLogWritePayload = {
          workspaceId,
          userId: user.userId,
          projectId:
            req.projectId ??
            params['projectId'] ??
            resultProjectId ??
            // project.* rows: the target *is* the project.
            (meta.target === 'project' && targetId ? targetId : null),
          action: meta.action,
          targetType: meta.target ?? null,
          targetId,
          metadata: req.logMeta ?? {},
        };
        this.auth.send(WORKSPACE_PATTERNS.LOG_WRITE, payload).subscribe({
          error: (err) =>
            this.logger.error(
              `Failed to write activity "${meta.action}": ${String(err)}`,
            ),
        });
      }),
    );
  }
}
