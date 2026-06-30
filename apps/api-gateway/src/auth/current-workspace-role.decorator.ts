import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injects the workspace role validated by WorkspaceGuard. */
export const CurrentWorkspaceRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ workspaceRole: string }>();
    return req.workspaceRole;
  },
);
