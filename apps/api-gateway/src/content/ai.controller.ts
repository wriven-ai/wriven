import { Body, Controller, Get, Inject, Logger, Patch, Post, UseGuards } from '@nestjs/common';
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
import { catchError, firstValueFrom, tap, throwError, timeout, TimeoutError } from 'rxjs';
import { CurrentProject } from '../auth/current-project.decorator';
import { CurrentProjectWorkspace } from '../auth/current-project-workspace.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { ProjectGuard } from '../auth/project.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { AiBurstGuard } from './ai-burst.guard';

/**
 * Parse a millisecond deadline from env. A blank or non-numeric value must
 * fall back to the default — `Number('')` is 0 and `timeout(0)` fails every
 * request instantly, so an empty `.env` line must never reach rxjs.
 */
function envTimeoutMs(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Deadline for the whole generate round-trip. It must sit ABOVE core's own
 * core→ai-service hop (`AI_SERVICE_TIMEOUT_MS`, ~35s) so core normally wins the
 * race and returns a real error; this is the backstop that stops a wedged
 * downstream from pinning a gateway worker (and, under burst, exhausting the
 * pool) for as long as the TCP call hangs.
 */
const AI_GATEWAY_TIMEOUT_MS = envTimeoutMs(process.env.AI_GATEWAY_TIMEOUT_MS, 40_000);

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
const AI_PROFILE_TIMEOUT_MS = envTimeoutMs(process.env.AI_PROFILE_TIMEOUT_MS, 8_000);
const PROFILE_TIMEOUT_ERROR: ServiceError = {
  code: ERROR_CODES.GATEWAY_TIMEOUT.code,
  message: 'AI profile request timed out.',
  statusCode: ERROR_CODES.GATEWAY_TIMEOUT.statusCode,
};

/**
 * Forwards to core.ai.generate — core owns scope/policy/quota/audit and
 * delegates to the Python ai-service. AiBurstGuard covers only /generate;
 * profile routes aren't LLM calls and must not consume burst budget.
 */
@Controller('content/ai')
@UseGuards(
  JwtAuthGuard,
  WorkspaceGuard,
  ProjectGuard,
  PermissionGuard,
)
export class AiController {
  private readonly logger = new Logger('AiController');

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
    // Trace step 1 of 3 (gateway → core → ai-service). The browser's requestId
    // is the correlation key across every hop — same value as ai-service's
    // X-Request-ID. Never log instruction/draft content.
    this.logger.log(
      `ai.generate step=gateway-accepted request_id=${dto.requestId} user=${user.userId} ` +
        `workspace=${workspaceId} target=${dto.targetKind}${dto.fieldKey ? `:${dto.fieldKey}` : ''} ` +
        `intent=${dto.intent}${dto.preset ? ` preset=${dto.preset}` : ''}`,
    );
    const startedAt = Date.now();
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
          tap(() =>
            this.logger.log(
              `ai.generate step=gateway-complete request_id=${dto.requestId} ` +
                `outcome=ok duration_ms=${Date.now() - startedAt}`,
            ),
          ),
          catchError((err) => {
            const code =
              err instanceof TimeoutError
                ? AI_TIMEOUT_ERROR.code
                : ((err as ServiceError)?.code ?? 'UNMAPPED');
            this.logger.warn(
              `ai.generate step=gateway-complete request_id=${dto.requestId} ` +
                `outcome=error code=${code} duration_ms=${Date.now() - startedAt}`,
            );
            return throwError(() =>
              err instanceof TimeoutError ? AI_TIMEOUT_ERROR : err,
            );
          }),
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
    // Authoritative workspace (resolved from the project record), NOT the
    // client's X-Workspace-Id header — the header is only membership-validated
    // and a member of two workspaces could otherwise mis-stamp the profile row.
    @CurrentProjectWorkspace() workspaceId: string,
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
