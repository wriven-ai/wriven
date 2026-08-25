import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips leading/trailing separators and collapses runs', () => {
    expect(slugify('  Funky --Name!! ')).toBe('funky-name');
  });

  it('falls back to "workspace" when nothing remains', () => {
    expect(slugify('!!!___')).toBe('workspace');
    expect(slugify('')).toBe('workspace');
  });

  it('caps length at 60 chars', () => {
    expect(slugify('a'.repeat(100))).toHaveLength(60);
  });
});

describe('uniqueSlug', () => {
  it('appends a 6-char hex suffix to the slug', () => {
    expect(uniqueSlug('My Workspace')).toMatch(/^my-workspace-[0-9a-f]{6}$/);
  });
});
