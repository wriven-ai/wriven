import { RpcException } from '@nestjs/microservices';
import { ERROR_CODES, ErrorCodeKey, ServiceError } from '@wriven/contracts';

/** Throw a structured error across TCP; the gateway maps it to the HTTP envelope. */
export function rpcError(key: ErrorCodeKey, message: string): RpcException {
  const { code, statusCode } = ERROR_CODES[key];
  const payload: ServiceError = { code, message, statusCode };
  return new RpcException(payload);
}
