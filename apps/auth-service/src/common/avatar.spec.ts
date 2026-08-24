import { resolveAvatarUrl } from './avatar';
import { setEnv } from '../testing/env';

describe('resolveAvatarUrl', () => {
  let restore: () => void;

  afterEach(() => restore());

  it('returns null for null/undefined/empty', () => {
    restore = setEnv({ R2_PUBLIC_URL: 'https://cdn.example.com/pub' });
    expect(resolveAvatarUrl(null)).toBeNull();
    expect(resolveAvatarUrl(undefined)).toBeNull();
    expect(resolveAvatarUrl('')).toBeNull();
  });

  it('passes http(s) URLs through unchanged (Google avatars)', () => {
    restore = setEnv({ R2_PUBLIC_URL: 'https://cdn.example.com/pub' });
    expect(resolveAvatarUrl('https://lh3.googleusercontent.com/x.jpg')).toBe(
      'https://lh3.googleusercontent.com/x.jpg',
    );
    expect(resolveAvatarUrl('http://example.com/a.png')).toBe(
      'http://example.com/a.png',
    );
  });

  it('prefixes an R2 key with R2_PUBLIC_URL', () => {
    restore = setEnv({ R2_PUBLIC_URL: 'https://cdn.example.com/pub' });
    expect(resolveAvatarUrl('avatars/u1/photo.png')).toBe(
      'https://cdn.example.com/pub/avatars/u1/photo.png',
    );
  });

  it('normalizes trailing base slash and leading key slashes', () => {
    restore = setEnv({ R2_PUBLIC_URL: 'https://cdn.example.com/pub/' });
    expect(resolveAvatarUrl('/avatars/u1/photo.png')).toBe(
      'https://cdn.example.com/pub/avatars/u1/photo.png',
    );
  });

  it('returns the raw key when R2_PUBLIC_URL is unset or empty', () => {
    restore = setEnv({ R2_PUBLIC_URL: undefined });
    expect(resolveAvatarUrl('avatars/u1/photo.png')).toBe(
      'avatars/u1/photo.png',
    );
    restore();
    restore = setEnv({ R2_PUBLIC_URL: '' });
    expect(resolveAvatarUrl('avatars/u1/photo.png')).toBe(
      'avatars/u1/photo.png',
    );
  });
});
