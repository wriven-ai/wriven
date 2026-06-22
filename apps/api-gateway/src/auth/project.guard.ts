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
  SERVICE_TOKENS,
  ServiceError,
  WORKSPACE_PATTERNS,
} from '@wriven/contracts';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';

interface ScopedRequest extends Request {
  user?: AuthUser;
  workspaceId?: string;
  workspaceRole?: string;
  projectId?: string;
  projectRole?: string;
}

/**
 * Validates the `X-Project-Id` header against the user's project membership
 * (via auth-service) before a project-scoped request is forwarded. Grants
 * implicit access when the user is an owner/admin of the project's workspace.
 * Must run after JwtAuthGuard and WorkspaceGuard (needs req.user + req.workspaceId).
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

    // Project members get their role validated.
    try {
      const membership = await firstValueFrom(
        this.auth.send<ProjectMembership>(
          PROJECT_PATTERNS.VALIDATE_PROJECT_MEMBER,
          { userId: req.user.userId, projectId },
        ),
      );
      req.projectId = membership.projectId;
      req.projectRole = membership.role;
      return true;
    } catch {
      // Fall through to workspace-admin bypass below.
    }

    // Workspace owner/admin has implicit access to all projects in the workspace.
    if (req.workspaceId && req.workspaceRole) {
      const wsMembership = await firstValueFrom(
        this.auth.send<ProjectMembership>(
          WORKSPACE_PATTERNS.VALIDATE_WORKSPACE_MEMBER,
          { userId: req.user.userId, workspaceId: req.workspaceId },
        ),
      );
      if (wsMembership.role === 'owner' || wsMembership.role === 'admin') {
        req.projectId = projectId;
        req.projectRole = 'admin';
        return true;
      }
    }

    throw { ...ERROR_CODES.FORBIDDEN, message: 'You do not have access to this project.' };
  }

  private error(message: string): ServiceError {
    return { ...ERROR_CODES.VALIDATION_ERROR, message };
  }
}
