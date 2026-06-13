/** Machine-readable error codes returned to the client (SCREAMING_SNAKE_CASE). */
export const ERROR_CODES = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', statusCode: 401 },
  FORBIDDEN: { code: 'FORBIDDEN', statusCode: 403 },
  NOT_FOUND: { code: 'NOT_FOUND', statusCode: 404 },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', statusCode: 422 },
  INVALID_CREDENTIALS: { code: 'INVALID_CREDENTIALS', statusCode: 401 },
  EMAIL_ALREADY_EXISTS: { code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 },
  INVALID_REFRESH_TOKEN: { code: 'INVALID_REFRESH_TOKEN', statusCode: 401 },
  INVALID_RESET_TOKEN: { code: 'INVALID_RESET_TOKEN', statusCode: 400 },
  INVALID_VERIFICATION_TOKEN: {
    code: 'INVALID_VERIFICATION_TOKEN',
    statusCode: 400,
  },
  OAUTH_FAILED: { code: 'OAUTH_FAILED', statusCode: 400 },
  RATE_LIMITED: { code: 'RATE_LIMITED', statusCode: 429 },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', statusCode: 500 },
} as const;

export type ErrorCodeKey = keyof typeof ERROR_CODES;
