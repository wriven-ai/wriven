import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthUser,
  ERROR_CODES,
  SERVICE_TOKENS,
  ServiceError,
  WORKSPACE_PATTERNS,
  WorkspaceMembership,
} from '@wriven/contracts';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';

interface ScopedRequest extends Request {
  user?: AuthUser;
  workspaceId?: string;
  workspaceRole?: string;
}

/**
 * Validates the `X-Workspace-Id` header against the user's membership
 * (via auth-service) before a workspace-scoped request is forwarded.
 * Must run after JwtAuthGuard (needs req.user).
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ScopedRequest>();
    const workspaceId = req.headers['x-workspace-id'];

    if (!workspaceId || typeof workspaceId !== 'string') {
      throw this.error('The X-Workspace-Id header is required.');
    }
    if (!req.user) {
      throw { ...ERROR_CODES.UNAUTHORIZED, message: 'Not authenticated.' };
    }

    // Throws FORBIDDEN (from auth-service) if the user isn't a member.
    const membership = await firstValueFrom(
      this.auth.send<WorkspaceMembership>(
        WORKSPACE_PATTERNS.VALIDATE_WORKSPACE_MEMBER,
        { userId: req.user.userId, workspaceId },
      ),
    );

    req.workspaceId = membership.workspaceId;
    req.workspaceRole = membership.role;
    return true;
  }

  private error(message: string): ServiceError {
    return { ...ERROR_CODES.VALIDATION_ERROR, message };
  }
}
