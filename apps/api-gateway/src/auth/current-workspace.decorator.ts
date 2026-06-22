import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injects the workspace id validated by WorkspaceGuard. */
export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ workspaceId: string }>();
    return req.workspaceId;
  },
);
