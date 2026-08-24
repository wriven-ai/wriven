import { ERROR_CODES } from '@wriven/contracts';

describe('ERROR_CODES contract', () => {
  it('exposes the shared error codes', () => {
    expect(ERROR_CODES.INVALID_CREDENTIALS).toBeDefined();
    expect(ERROR_CODES.FORBIDDEN).toBeDefined();
    expect(ERROR_CODES.NOT_FOUND).toBeDefined();
  });
});
