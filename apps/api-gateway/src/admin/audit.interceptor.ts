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
  ADMIN_PATTERNS,
  AdminAuthUser,
  AuditWritePayload,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, AuditConfig } from './audit.decorator';

/**
 * Writes an `admin_audit_log` entry after any `@Audit(...)`-marked admin route
 * succeeds. Fire-and-forget — a logging failure never fails the request, but is
 * logged for follow-up.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AdminAudit');

  constructor(
    private readonly reflector: Reflector,
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditConfig | undefined>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<
      Request & {
        adminUser?: AdminAuthUser;
        auditMeta?: Record<string, unknown>;
        params: Record<string, string>;
      }
    >();

    return next.handle().pipe(
      tap(() => {
        const admin = req.adminUser;
        if (!admin) return;
        const payload: AuditWritePayload = {
          adminUserId: admin.adminUserId,
          action: meta.action,
          targetType: meta.target ?? null,
          targetId: req.params?.['id'] ?? null,
          metadata: req.auditMeta ?? {},
          ip: req.ip ?? null,
        };
        this.auth.send(ADMIN_PATTERNS.AUDIT_WRITE, payload).subscribe({
          error: (err) =>
            this.logger.error(
              `Failed to write audit entry "${meta.action}": ${String(err)}`,
            ),
        });
      }),
    );
  }
}
