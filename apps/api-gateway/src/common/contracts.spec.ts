import { ERROR_CODES } from '@wriven/contracts';

describe('ERROR_CODES contract', () => {
  it('exposes the shared error codes', () => {
    expect(ERROR_CODES.UNAUTHORIZED).toBeDefined();
    expect(ERROR_CODES.FORBIDDEN).toBeDefined();
    expect(ERROR_CODES.RATE_LIMITED).toBeDefined();
  });
});
