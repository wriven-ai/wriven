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
  PROJECT_PATTERNS,
  ProjectMembership,
  ProjectRole,
  SERVICE_TOKENS,
  ServiceError,
} from '@wriven/contracts';
import type { Permission } from '@wriven/contracts';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';

interface ScopedRequest extends Request {
  user?: AuthUser;
  workspaceId?: string;
  workspaceRole?: string;
  projectId?: string;
  /** Workspace owning the project, resolved from the project row by
   *  auth-service — the authoritative binding, unlike the client's
   *  `X-Workspace-Id` header. */
  projectWorkspaceId?: string;
  projectRole?: ProjectRole | null;
  projectPermissions?: Set<Permission>;
}

/**
 * Validates the `X-Project-Id` header against the user's project membership
 * (via auth-service) before a project-scoped request is forwarded. The
 * workspace → project permission cascade — including implicit access for
 * workspace owners/admins with no `project_members` row — is resolved
 * auth-service-side, so the returned permission set is already complete and no
 * gateway bypass is needed. Must run after JwtAuthGuard and WorkspaceGuard.
 */
@Injectable()
export class ProjectGuard implements CanActivate {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ScopedRequest>();
    const projectId = req.headers['x-project-id'];

    if (!projectId || typeof projectId !== 'string') {
      throw this.error('The X-Project-Id header is required.');
    }
    if (!req.user) {
      throw { ...ERROR_CODES.UNAUTHORIZED, message: 'Not authenticated.' };
    }

    // auth-service resolves the cascade (incl. workspace owner/admin access
    // with no project row) and throws FORBIDDEN if the user has no access.
    const membership = await firstValueFrom(
      this.auth.send<ProjectMembership>(
        PROJECT_PATTERNS.VALIDATE_PROJECT_MEMBER,
        { userId: req.user.userId, projectId },
      ),
    );

    req.projectId = membership.projectId;
    req.projectWorkspaceId = membership.workspaceId;
    req.projectRole = membership.role;
    req.projectPermissions = new Set(membership.permissions);
    return true;
  }

  private error(message: string): ServiceError {
    return { ...ERROR_CODES.VALIDATION_ERROR, message };
  }
}
