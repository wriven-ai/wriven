import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injects the caller's workspace role set by WorkspaceGuard
 *  (`owner` | `admin` | `member` | `guest`). */
export const CurrentWorkspaceRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<{ workspaceRole?: string }>();
    return req.workspaceRole;
  },
);
