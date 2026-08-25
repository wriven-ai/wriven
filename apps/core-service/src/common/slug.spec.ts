import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases, hyphenates, trims separators', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('  My --Post!! ')).toBe('my-post');
  });

  it('falls back to "entry" when nothing remains', () => {
    expect(slugify('!!!')).toBe('entry');
    expect(slugify('')).toBe('entry');
  });

  it('caps length at 110 chars (entries keep longer titles readable)', () => {
    expect(slugify('a'.repeat(200))).toHaveLength(110);
  });
});

describe('uniqueSlug', () => {
  it('appends a 6-char hex suffix', () => {
    expect(uniqueSlug('My Post')).toMatch(/^my-post-[0-9a-f]{6}$/);
  });
});
