import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AI_PATTERNS,
  AiGenerateDto,
  Permission,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import type { AuthUser } from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
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
 * AI content generation HTTP edge. Forwards to core-service's
 * `core.ai.generate` (AiModule). Core owns scope, policy, quota, and audit;
 * it delegates prompt assembly and provider calls to the internal Python
 * ai-service. Scoped like other content routes (JWT + workspace + project +
 * permission) plus the per-workspace {@link AiBurstGuard}.
 */
@Controller('content/ai')
@UseGuards(
  JwtAuthGuard,
  WorkspaceGuard,
  ProjectGuard,
  PermissionGuard,
  AiBurstGuard,
)
export class AiController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Post('generate')
  @RequirePermission(Permission.AI_GENERATE)
  generate(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentProject() projectId: string,
    @Body() dto: AiGenerateDto,
  ) {
    return firstValueFrom(
      this.core.send(AI_PATTERNS.GENERATE, {
        workspaceId,
        projectId,
        userId: user.userId,
        dto,
      }),
    );
  }
}
