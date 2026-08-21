import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate-limit by the REAL client IP behind the proxy chain (Render's LB, and
 * Cloudflare when it fronts the API). Lookup order: CF-Connecting-IP, then
 * the client-most X-Forwarded-For hop, then the socket IP. Header forgery
 * requires bypassing the proxies and hitting the origin directly — acceptable
 * for throttling (a forged IP just rotates buckets, like raw internet
 * traffic). The durable Delivery-API control is the per-API-key limit.
 */
@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const r = req as Request;
    const cf = r.headers['cf-connecting-ip'];
    const forwarded = r.headers['x-forwarded-for'];
    const firstForwarded =
      typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : '';
    const tracker =
      (typeof cf === 'string' ? cf.trim() : '') ||
      firstForwarded ||
      r.ip ||
      'unknown';
    return Promise.resolve(tracker);
  }
}
