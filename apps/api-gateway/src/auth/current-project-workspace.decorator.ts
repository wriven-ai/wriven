import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Injects the workspace that OWNS the current project, resolved from the
 * project record by auth-service via ProjectGuard. Use this — not
 * `CurrentWorkspace` — when a downstream write stamps a workspace id onto a
 * row: the `X-Workspace-Id` header is only membership-validated, never checked
 * against the project's actual owner.
 */
export const CurrentProjectWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ projectWorkspaceId: string }>();
    return req.projectWorkspaceId;
  },
);
