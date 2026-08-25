import { GoogleStrategy } from './google.strategy';
import { configStub } from '../testing/config-stub';

function makeStrategy() {
  return new GoogleStrategy(
    configStub({
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_CALLBACK_URL: 'https://api.test/auth/google/callback',
    }),
  );
}

/** Minimal passport-google-oauth20 Profile. */
function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g-42',
    displayName: 'Ada Lovelace',
    emails: [{ value: 'Ada@Google.com' }],
    photos: [{ value: 'https://lh/avatar.png' }],
    ...overrides,
  } as never;
}

describe('GoogleStrategy.validate', () => {
  it('maps the passport profile onto the contracts GoogleProfile', () => {
    const done = jest.fn();
    makeStrategy().validate('at', 'rt', profile(), done);

    expect(done).toHaveBeenCalledWith(null, {
      googleId: 'g-42',
      email: 'ada@google.com', // lowercased
      name: 'Ada Lovelace',
      avatar: 'https://lh/avatar.png',
    });
  });

  it('falls back: no displayName → email, no email → "User", no photos → null', () => {
    const done = jest.fn();
    makeStrategy().validate(
      'at',
      'rt',
      profile({ displayName: undefined, emails: [{ value: 'x@y.z' }], photos: undefined }),
      done,
    );

    expect(done).toHaveBeenCalledWith(null, {
      googleId: 'g-42',
      email: 'x@y.z',
      name: 'x@y.z',
      avatar: null,
    });
  });
});
