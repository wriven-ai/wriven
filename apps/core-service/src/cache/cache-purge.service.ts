import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Purges CDN cache by tag when content changes (doc/11 Phase 5). The Delivery
 * API tags every published response with `proj_<id> type_<apiId> entry_<id>`;
 * here we purge the affected tags so a publish invalidates exactly the right
 * responses — never a wildcard.
 *
 * Provider: Cloudflare cache-tag purge. Adapter-style + lazy: with no CDN env
 * configured it's a no-op (logs once), so the app runs fine without a CDN.
 */
@Injectable()
export class CachePurgeService {
  private readonly logger = new Logger(CachePurgeService.name);

  constructor(private readonly config: ConfigService) {}

  private get zoneId(): string | undefined {
    return this.config.get<string>('CF_ZONE_ID');
  }
  private get apiToken(): string | undefined {
    return this.config.get<string>('CF_API_TOKEN');
  }

  /** Purge an entry's responses: its own + every list of its type. */
  async purgeEntry(apiId: string, entryId: string): Promise<void> {
    await this.purgeTags([`entry_${entryId}`, `type_${apiId}`]);
  }

  /** Best-effort tag purge — failures are logged, never thrown. */
  async purgeTags(tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    const zoneId = this.zoneId;
    const apiToken = this.apiToken;
    if (!zoneId || !apiToken) {
      // No CDN configured — published responses simply aren't fronted by a CDN yet.
      this.logger.debug(`CDN purge skipped (not configured): ${tags.join(' ')}`);
      return;
    }
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tags }),
        },
      );
      if (!res.ok) {
        this.logger.warn(`CDN purge failed (${res.status}) for: ${tags.join(' ')}`);
      }
    } catch (err) {
      this.logger.warn(`CDN purge error for ${tags.join(' ')}: ${String(err)}`);
    }
  }
}
