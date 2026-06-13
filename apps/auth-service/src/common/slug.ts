import { randomBytes } from 'crypto';

/** Lowercase, hyphenated, alnum-only slug capped at 60 chars. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'workspace';
}

/** Slug with a short random suffix to avoid unique-constraint collisions. */
export function uniqueSlug(input: string): string {
  return `${slugify(input)}-${randomBytes(3).toString('hex')}`;
}
