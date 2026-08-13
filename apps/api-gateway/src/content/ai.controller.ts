import { Body, Controller, Get, Inject, Patch, Post, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AI_PATTERNS,
  AiGenerateDto,
  AiProfileView,
  ERROR_CODES,
  Permission,
  SERVICE_TOKENS,
  UpdateAiProfileDto,
} from '@wriven/contracts';
import type { AuthUser, ServiceError } from '@wriven/contracts';
import { catchError, firstValueFrom, throwError, timeout, TimeoutError } from 'rxjs';
import { CurrentProject } from '../auth/current-project.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { ProjectGuard } from '../auth/project.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { AiBurstGuard } from './ai-burst.guard';

/**
 * Deadline for the whole generate round-trip. It must sit ABOVE core's own
 * core→ai-service hop (`AI_SERVICE_TIMEOUT_MS`, ~35s) so core normally wins the
 * race and returns a real error; this is the backstop that stops a wedged
 * downstream from pinning a gateway worker (and, under burst, exhausting the
 * pool) for as long as the TCP call hangs.
 */
const AI_GATEWAY_TIMEOUT_MS = Number(
  process.env.AI_GATEWAY_TIMEOUT_MS ?? '40000',
);

/** The leak-free envelope the AllExceptionsFilter forwards verbatim. */
const AI_TIMEOUT_ERROR: ServiceError = {
  code: ERROR_CODES.AI_GENERATION_FAILED.code,
  message: 'AI generation failed.',
  statusCode: ERROR_CODES.AI_GENERATION_FAILED.statusCode,
};

/**
 * Deadline for the profile read/edit round-trip. These are fast core reads (no
 * provider call), so a short backstop is enough — but without it a wedged core
 * pins a gateway worker with no deadline. 504 (not 502) because no generation
 * was attempted.
 */
const AI_PROFILE_TIMEOUT_MS = Number(
  process.env.AI_PROFILE_TIMEOUT_MS ?? '8000',
);
const PROFILE_TIMEOUT_ERROR: ServiceError = {
  code: 'GATEWAY_TIMEOUT',
  message: 'AI profile request timed out.',
  statusCode: 504,
};

/**
 * AI content generation HTTP edge. Forwards to core-service's
 * `core.ai.generate` (AiModule). Core owns scope, policy, quota, and audit;
 * it delegates prompt assembly and provider calls to the internal Python
 * ai-service. Scoped like other content routes (JWT + workspace + project +
 * permission). The per-workspace {@link AiBurstGuard} guards only the generate
 * route — profile read/edit are not LLM calls and must not consume the burst
 * budget.
 */
@Controller('content/ai')
@UseGuards(
  JwtAuthGuard,
  WorkspaceGuard,
  ProjectGuard,
  PermissionGuard,
)
export class AiController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Post('generate')
  @UseGuards(AiBurstGuard)
  @RequirePermission(Permission.AI_GENERATE)
  generate(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: AiGenerateDto,
  ) {
    return firstValueFrom(
      this.core
        .send(AI_PATTERNS.GENERATE, {
          workspaceId,
          projectId,
          userId: user.userId,
          dto,
        })
        .pipe(
          timeout(AI_GATEWAY_TIMEOUT_MS),
          catchError((err) =>
            throwError(() => (err instanceof TimeoutError ? AI_TIMEOUT_ERROR : err)),
          ),
        ),
    );
  }

  @Get('profile')
  @RequirePermission(Permission.CONTENT_TYPE_MANAGE)
  readProfile(
    @CurrentProject() projectId: string,
  ): Promise<AiProfileView> {
    return firstValueFrom(
      this.core.send<AiProfileView>(AI_PATTERNS.PROFILE_READ, { projectId }).pipe(
        timeout(AI_PROFILE_TIMEOUT_MS),
        catchError((err) =>
          throwError(() => (err instanceof TimeoutError ? PROFILE_TIMEOUT_ERROR : err)),
        ),
      ),
    );
  }

  @Patch('profile')
  @RequirePermission(Permission.CONTENT_TYPE_MANAGE)
  updateProfile(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: UpdateAiProfileDto,
  ): Promise<AiProfileView> {
    return firstValueFrom(
      this.core
        .send<AiProfileView>(AI_PATTERNS.PROFILE_UPDATE, {
          workspaceId,
          projectId,
          userId: user.userId,
          dto,
        })
        .pipe(
          timeout(AI_PROFILE_TIMEOUT_MS),
          catchError((err) =>
            throwError(() => (err instanceof TimeoutError ? PROFILE_TIMEOUT_ERROR : err)),
          ),
        ),
    );
  }
}
