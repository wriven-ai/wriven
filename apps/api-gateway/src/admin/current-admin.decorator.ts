import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminAuthUser } from '@wriven/contracts';

/** Injects the admin identity attached by AdminJwtGuard. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminAuthUser => {
    const req = ctx.switchToHttp().getRequest<{ adminUser: AdminAuthUser }>();
    return req.adminUser;
  },
);
