import { Logger } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { ERROR_CODES } from '@wriven/contracts';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { httpHost } from '../testing/http';

beforeAll(() => {
  Logger.overrideLogger([]);
});

const filter = new AllExceptionsFilter();

function catchInto(exception: unknown) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  filter.catch(exception, httpHost(res));
  const statusCode = res.status.mock.calls[0][0] as number;
  const body = res.json.mock.calls[0][0] as {
    success: boolean;
    error: { code: string; message: string; statusCode: number };
  };
  return { res, statusCode, body };
}

describe('AllExceptionsFilter', () => {
  it('writes the {success:false, error} envelope with the mapped status', () => {
    const { res, statusCode, body } = catchInto(
      new HttpException({ message: ['bad'] }, 422),
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(statusCode).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR.code);
  });

  it('ServiceError objects from downstream TCP pass through untouched', () => {
    const serviceError = {
      code: 'PLAN_LIMIT_REACHED',
      statusCode: 403,
      message: 'nope',
    };
    const { statusCode, body } = catchInto(serviceError);
    expect(statusCode).toBe(403);
    expect(body.error).toEqual(serviceError);
  });

  it('422 validation → first array message', () => {
    const { body } = catchInto(
      new HttpException({ message: ['email must be an email', 'x'] }, 422),
    );
    expect(body.error.message).toBe('email must be an email');
  });

  it('400 with a string body → VALIDATION_ERROR with that message', () => {
    const { body } = catchInto(new HttpException('Malformed body', 400));
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR.code);
    expect(body.error.message).toBe('Malformed body');
  });

  it('429 → RATE_LIMITED, forwarding the thrown message', () => {
    const { statusCode, body } = catchInto(
      new HttpException({ message: 'AI burst limit reached' }, 429),
    );
    expect(statusCode).toBe(429);
    expect(body.error.code).toBe(ERROR_CODES.RATE_LIMITED.code);
    expect(body.error.message).toBe('AI burst limit reached');
  });

  it('404 → NOT_FOUND via the statusCode lookup', () => {
    const { body } = catchInto(new HttpException('Not Found', 404));
    expect(body.error.code).toBe(ERROR_CODES.NOT_FOUND.code);
    expect(body.error.statusCode).toBe(404);
  });

  it('unmapped status keeps its code and number (generic ERROR code)', () => {
    const { statusCode, body } = catchInto(new HttpException('teapot', 418));
    expect(statusCode).toBe(418);
    expect(body.error.code).toBe('ERROR');
    expect(body.error.statusCode).toBe(418);
  });

  it('non-HttpException → INTERNAL_ERROR, no internals leaked', () => {
    const { statusCode, body } = catchInto(new Error('db password is hunter2'));
    expect(statusCode).toBe(ERROR_CODES.INTERNAL_ERROR.statusCode);
    expect(body.error.code).toBe(ERROR_CODES.INTERNAL_ERROR.code);
    expect(body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });
});
