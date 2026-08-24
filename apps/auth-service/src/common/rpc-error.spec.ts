import { RpcException } from '@nestjs/microservices';
import { ERROR_CODES } from '@wriven/contracts';
import { rpcError } from './rpc-error';

describe('ERROR_CODES contract', () => {
  it('exposes the shared error codes', () => {
    expect(ERROR_CODES.INVALID_CREDENTIALS).toBeDefined();
    expect(ERROR_CODES.FORBIDDEN).toBeDefined();
    expect(ERROR_CODES.NOT_FOUND).toBeDefined();
  });
});

describe('rpcError', () => {
  it('builds an RpcException from the ERROR_CODES entry', () => {
    const error = rpcError('NOT_FOUND', 'Workspace not found');
    expect(error).toBeInstanceOf(RpcException);
    expect(error.getError()).toEqual({
      code: ERROR_CODES.NOT_FOUND.code,
      message: 'Workspace not found',
      statusCode: ERROR_CODES.NOT_FOUND.statusCode,
    });
  });

  it.each(['FORBIDDEN', 'VALIDATION_ERROR', 'INVALID_CREDENTIALS'] as const)(
    'carries the contract statusCode for %s',
    (key) => {
      const error = rpcError(key, 'msg');
      expect(error.getError()).toMatchObject({
        code: ERROR_CODES[key].code,
        statusCode: ERROR_CODES[key].statusCode,
      });
    },
  );

  it('passes the custom message through untouched', () => {
    const error = rpcError('CONFLICT', 'Name taken');
    expect((error.getError() as { message: string }).message).toBe(
      'Name taken',
    );
  });
});
