import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import type { ServiceError } from '@wriven/contracts';

/** ExecutionContext stub whose `switchToHttp().getRequest()` returns `req`. */
export function httpContext(req: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

/** ArgumentsHost stub whose `switchToHttp().getResponse()` returns `res`. */
export function httpHost(res: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
}

/**
 * Run a sync fn expected to throw a plain ServiceError object (gateway guards
 * throw literals, not HttpExceptions) and return it.
 */
export function serviceErrorThrown(fn: () => unknown): ServiceError {
  try {
    fn();
  } catch (err) {
    return err as ServiceError;
  }
  throw new Error('expected the guard to throw');
}

