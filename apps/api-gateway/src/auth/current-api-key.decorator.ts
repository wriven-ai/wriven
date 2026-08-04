import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ApiKeyResolution } from '@wriven/contracts';

/** Injects the API key resolution (project/workspace/scope) set by ApiKeyGuard. */
export const CurrentApiKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiKeyResolution =>
    ctx.switchToHttp().getRequest<{ apiKey: ApiKeyResolution }>().apiKey,
);
