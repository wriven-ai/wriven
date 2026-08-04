import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiKeyResolution,
  ApiKeyScope,
  CORE_PATTERNS,
  ERROR_CODES,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';
import { API_KEY_SCOPES_KEY } from './api-key-scope.decorator';

interface KeyedRequest extends Request {
  apiKey?: ApiKeyResolution;
  workspaceId?: string;
  projectId?: string;
}

interface CacheEntry {
  resolution: ApiKeyResolution | null;
  expiresAt: number;
}

/** Short in-memory TTL so a busy site doesn't hit core-service per request. */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

/**
 * Authenticates a public Delivery API request by its `Authorization: Bearer
 * wrk_…` key. Resolves the key to its project scope via core-service, gates by
 * the route's required scope, and pins the request to that project — a key can
 * never reach another project. Sets `req.projectId`/`req.workspaceId` so the
 * existing `@CurrentProject`/`@CurrentWorkspace` decorators work unchanged.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<KeyedRequest>();

    const token = this.bearerToken(req);
    if (!token) {
      throw { ...ERROR_CODES.UNAUTHORIZED, message: 'A Bearer API key is required.' };
    }

    const resolution = await this.resolve(token);
    if (!resolution) {
      throw { ...ERROR_CODES.UNAUTHORIZED, message: 'Invalid or revoked API key.' };
    }

    const allowed = this.reflector.getAllAndOverride<ApiKeyScope[] | undefined>(
      API_KEY_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed && allowed.length > 0 && !allowed.includes(resolution.scope)) {
      throw {
        ...ERROR_CODES.FORBIDDEN,
        message: 'This API key lacks the required scope.',
      };
    }

    req.apiKey = resolution;
    req.workspaceId = resolution.workspaceId;
    req.projectId = resolution.projectId;
    return true;
  }

  private bearerToken(req: Request): string | null {
    const header = req.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
  }

  /** Cache keyed by token hash — never hold the raw token in memory. */
  private async resolve(token: string): Promise<ApiKeyResolution | null> {
    const key = createHash('sha256').update(token).digest('hex');
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) return hit.resolution;

    const resolution = await firstValueFrom(
      this.core.send<ApiKeyResolution | null>(CORE_PATTERNS.API_KEY_RESOLVE, {
        token,
      }),
    );
    cache.set(key, { resolution, expiresAt: now + CACHE_TTL_MS });
    return resolution;
  }
}
