import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';

/**
 * Per-workspace sliding-window burst throttle on the AI generate route
 * (~10 requests/min). The monthly `aiTextRequestsPerMonth` quota stops
 * long-term abuse; this stops one workspace from exhausting the shared AI
 * provider key's rate limit (e.g. OpenRouter's ~20 RPM) and degrading AI for
 * every user. The AllExceptionsFilter maps the thrown 429 → `RATE_LIMITED`.
 *
 * In-memory — fine for a single gateway instance; revisit if horizontally
 * scaled (move to Redis). Must run AFTER `WorkspaceGuard` so `req.workspaceId`
 * is set.
 */
@Injectable()
export class AiBurstGuard implements CanActivate {
  private readonly windowMs = 60_000;
  private readonly max = 10;
  private readonly hits = new Map<string, number[]>();
  private lastSweep = Date.now();

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ workspaceId?: string }>();
    const workspaceId = req.workspaceId;
    if (!workspaceId) return true; // nothing to key on — let auth guards decide

    const now = Date.now();
    // Opportunistic sweep (at most once per window): drop entries for workspaces
    // that have gone idle for a full window, so the map is bounded by *active*
    // workspaces rather than every workspace that ever generated. Without this
    // the keys accumulate forever (one per historical workspace).
    if (now - this.lastSweep > this.windowMs) {
      this.lastSweep = now;
      for (const [ws, times] of this.hits) {
        if (!times.some((t) => t > now - this.windowMs)) this.hits.delete(ws);
      }
    }

    const recent = (this.hits.get(workspaceId) ?? []).filter(
      (t) => t > now - this.windowMs,
    );
    recent.push(now);
    this.hits.set(workspaceId, recent);

    if (recent.length > this.max) {
      throw new HttpException(
        'Too many AI requests from this workspace — please slow down.',
        429,
      );
    }
    return true;
  }
}
