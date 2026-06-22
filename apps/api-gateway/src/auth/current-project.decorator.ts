import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injects the project id validated by ProjectGuard. */
export const CurrentProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ projectId: string }>();
    return req.projectId;
  },
);
