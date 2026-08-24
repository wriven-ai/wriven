import { ERROR_CODES } from '@wriven/contracts';

describe('ERROR_CODES contract', () => {
  it('exposes the shared error codes', () => {
    expect(ERROR_CODES.UNAUTHORIZED).toBeDefined();
    expect(ERROR_CODES.NOT_FOUND).toBeDefined();
    expect(ERROR_CODES.PLAN_LIMIT_REACHED).toBeDefined();
  });
});
