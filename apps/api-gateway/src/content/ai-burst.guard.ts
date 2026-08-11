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
 * is set. See specs/19.
 */
@Injectable()
export class AiBurstGuard implements CanActivate {
  private readonly windowMs = 60_000;
  private readonly max = 10;
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ workspaceId?: string }>();
    const workspaceId = req.workspaceId;
    if (!workspaceId) return true; // nothing to key on — let auth guards decide

    const now = Date.now();
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
