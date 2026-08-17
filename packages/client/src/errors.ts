/** Thrown for any non-success Delivery API response or transport failure. */
export class WrivenError extends Error {
  /** HTTP status (0 for network/timeout failures). */
  readonly status: number;
  /** Machine-readable error code from the API envelope, when present. */
  readonly code: string;

  constructor(message: string, status: number, code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'WrivenError';
    this.status = status;
    this.code = code;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, WrivenError.prototype);
  }
}

/** Type guard — separates Wriven failures from unrelated errors in catch blocks. */
export function isWrivenError(err: unknown): err is WrivenError {
  return err instanceof WrivenError;
}
