import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate-limit by the REAL client IP behind the proxy chain (Render's LB, and
 * Cloudflare when its cache-purge integration fronts the API). Without this,
 * Express sees only the proxy's IP — every visitor shares a handful of
 * load-balancer buckets and the global 100/min limit trips for everyone at
 * once under real traffic.
 *
 * Lookup order: Cloudflare's per-connection header (`CF-Connecting-IP`),
 * then the first (client-most) `X-Forwarded-For` hop, then the socket IP.
 *
 * Header forgery is only possible by bypassing the proxies and hitting the
 * origin directly — an acceptable trade for throttling (a forged IP just means
 * an attacker rotates buckets, which is what raw internet traffic looks like
 * anyway). The durable Delivery-API control is the per-API-key limit, tracked
 * in doc/market-readiness.md.
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
