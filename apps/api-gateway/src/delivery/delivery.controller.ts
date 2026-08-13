import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import * as contracts from '@wriven/contracts';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentApiKey } from '../auth/current-api-key.decorator';
import { UsageBufferService } from '../usage/usage-buffer.service';
import { UsageEnforceService } from '../usage/usage-enforce.service';

/** Read keys see published only; preview/manage keys also see drafts. */
const isPreview = (key: contracts.ApiKeyResolution): boolean => key.scope !== 'read';

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
    @Inject(contracts.SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
    private readonly usageEnforce: UsageEnforceService,
    private readonly usageBuffer: UsageBufferService,
  ) {}

  @Get('content/:apiId')
  async list(
    @CurrentApiKey() key: contracts.ApiKeyResolution,
    @Param('projectId') projectId: string,
    @Param('apiId') apiId: string,
    @Query() query: contracts.DeliveryQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertProject(key, projectId);
    await this.usageEnforce.assertRequests(key.workspaceId);
    const preview = isPreview(key);
    const result = await firstValueFrom<{ items: Array<{ id: string }> }>(
      this.core.send(contracts.CORE_PATTERNS.DELIVERY_LIST, {
        projectId: key.projectId,
        apiId,
        query,
        preview,
      }),
    );
    // A list depends on its project, type, and every entry it returned — so it
    // invalidates when any member is (un)published or deleted.
    const tags = [
      `proj_${key.projectId}`,
      `type_${apiId}`,
      ...result.items.map((e) => `entry_${e.id}`),
    ];
    this.setCache(res, preview, tags);
    this.usageBuffer.bump(key.workspaceId);
    return result;
  }

  @Get('content/:apiId/:slug')
  async get(
    @CurrentApiKey() key: contracts.ApiKeyResolution,
    @Param('projectId') projectId: string,
    @Param('apiId') apiId: string,
    @Param('slug') slug: string,
    @Query() query: contracts.DeliveryQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertProject(key, projectId);
    await this.usageEnforce.assertRequests(key.workspaceId);
    const preview = isPreview(key);
    const result = await firstValueFrom<{ id: string }>(
      this.core.send(contracts.CORE_PATTERNS.DELIVERY_GET, {
        projectId: key.projectId,
        apiId,
        slug,
        query,
        preview,
      }),
    );
    const tags = [`proj_${key.projectId}`, `type_${apiId}`, `entry_${result.id}`];
    this.setCache(res, preview, tags);
    this.usageBuffer.bump(key.workspaceId);
    return result;
  }

  /**
   * Preview reads must never be cached (drafts). Published reads are cacheable at
   * the CDN with surrogate/cache tags so a publish can purge exactly the affected
   * responses by tag (plans/01 Phase 5; purge-on-publish lives in core).
   */
  private setCache(res: Response, preview: boolean, tags: string[]): void {
    if (preview) {
      res.setHeader('Cache-Control', 'private, no-store');
      return;
    }
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300',
    );
    const tagValue = tags.join(' ');
    res.setHeader('Surrogate-Key', tagValue); // Fastly
    res.setHeader('Cache-Tag', tagValue); // Cloudflare
  }

  /** The path project must be the key's project — reject mismatches. */
  private assertProject(key: contracts.ApiKeyResolution, pathProjectId: string): void {
    if (key.projectId !== pathProjectId) {
      throw {
        ...contracts.ERROR_CODES.FORBIDDEN,
        message: 'This API key cannot access the requested project.',
      };
    }
  }
}
