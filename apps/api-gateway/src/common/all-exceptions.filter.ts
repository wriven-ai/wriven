import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ERROR_CODES, ServiceError } from '@wriven/contracts';
import type { Response } from 'express';

function isServiceError(e: unknown): e is ServiceError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    'statusCode' in e &&
    'message' in e
  );
}

/** Maps every thrown error to the standard `{ success:false, error }` envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Gateway');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const error = this.resolve(exception);
    res.status(error.statusCode).json({ success: false, error });
  }

  private resolve(exception: unknown): ServiceError {
    // Structured error forwarded from a downstream service over TCP.
    if (isServiceError(exception)) {
      return exception;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // ValidationPipe (422) — surface the first validation message.
      if (
        status === ERROR_CODES.VALIDATION_ERROR.statusCode ||
        status === 400
      ) {
        return {
          code: ERROR_CODES.VALIDATION_ERROR.code,
          message: this.firstMessage(body) ?? 'Request validation failed.',
          statusCode: ERROR_CODES.VALIDATION_ERROR.statusCode,
        };
      }
      if (status === ERROR_CODES.RATE_LIMITED.statusCode) {
        // Forward the thrown message when present — the per-route guards
        // (e.g. AiBurstGuard's workspace-scoped copy) are more specific than
        // this generic fallback.
        return {
          code: ERROR_CODES.RATE_LIMITED.code,
          message:
            this.firstMessage(body) ??
            'Too many requests. Please slow down and try again shortly.',
          statusCode: ERROR_CODES.RATE_LIMITED.statusCode,
        };
      }
      const mapped = Object.values(ERROR_CODES).find(
        (c) => c.statusCode === status,
      );
      return {
        code: mapped?.code ?? 'ERROR',
        message: this.firstMessage(body) ?? exception.message,
        statusCode: status,
      };
    }

    this.logger.error('Unhandled exception', exception as Error);
    return {
      code: ERROR_CODES.INTERNAL_ERROR.code,
      message: 'An unexpected error occurred.',
      statusCode: ERROR_CODES.INTERNAL_ERROR.statusCode,
    };
  }

  private firstMessage(body: unknown): string | undefined {
    if (typeof body === 'string') return body;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const m = (body as { message: unknown }).message;
      return Array.isArray(m)
        ? String(m[0])
        : typeof m === 'string'
          ? m
          : undefined;
    }
    return undefined;
  }
}
