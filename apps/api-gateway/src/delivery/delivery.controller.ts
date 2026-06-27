import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiKeyResolution,
  CORE_PATTERNS,
  DeliveryQueryDto,
  ERROR_CODES,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentApiKey } from '../auth/current-api-key.decorator';

/** Read keys see published only; preview/manage keys also see drafts. */
const isPreview = (key: ApiKeyResolution): boolean => key.scope !== 'read';

/**
 * Public Content Delivery API. Authenticated by a project-scoped API key
 * (`Authorization: Bearer wrk_…`), not a session. Returns published content
 * only. The project is taken from the resolved key — the `:projectId` in the
 * path must match it, so a key can never read another project.
 */
@Controller('v1/projects/:projectId')
@UseGuards(ApiKeyGuard)
export class DeliveryController {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get('content/:apiId')
  list(
    @CurrentApiKey() key: ApiKeyResolution,
    @Param('projectId') projectId: string,
    @Param('apiId') apiId: string,
    @Query() query: DeliveryQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertProject(key, projectId);
    const preview = isPreview(key);
    this.setCache(res, preview);
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.DELIVERY_LIST, {
        projectId: key.projectId,
        apiId,
        query,
        preview,
      }),
    );
  }

  @Get('content/:apiId/:slug')
  get(
    @CurrentApiKey() key: ApiKeyResolution,
    @Param('projectId') projectId: string,
    @Param('apiId') apiId: string,
    @Param('slug') slug: string,
    @Query() query: DeliveryQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertProject(key, projectId);
    const preview = isPreview(key);
    this.setCache(res, preview);
    return firstValueFrom(
      this.core.send(CORE_PATTERNS.DELIVERY_GET, {
        projectId: key.projectId,
        apiId,
        slug,
        query,
        preview,
      }),
    );
  }

  /**
   * Preview reads must never be cached (drafts). Published reads are left
   * uncached for now; CDN cache headers land in doc/11 Phase 5.
   */
  private setCache(res: Response, preview: boolean): void {
    if (preview) res.setHeader('Cache-Control', 'private, no-store');
  }

  /** The path project must be the key's project — reject mismatches. */
  private assertProject(key: ApiKeyResolution, pathProjectId: string): void {
    if (key.projectId !== pathProjectId) {
      throw {
        ...ERROR_CODES.FORBIDDEN,
        message: 'This API key cannot access the requested project.',
      };
    }
  }
}
