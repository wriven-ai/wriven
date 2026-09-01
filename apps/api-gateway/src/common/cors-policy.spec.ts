import { resolveCorsPolicy } from './cors-policy';

const ALLOW = ['https://wriven.tech', 'http://localhost:3000'];

describe('resolveCorsPolicy', () => {
  describe('delivery routes — any origin, credentials OFF (Bearer keys only)', () => {
    it.each([
      ['/v1/projects/p1/content/posts', 'content list'],
      ['/v1/projects/p1/content/posts/my-slug', 'content by slug'],
      ['/v1/projects/p1/media/img.png', 'media (future route)'],
    ])('%s (%s) reflects any origin without credentials', (path) => {
      expect(resolveCorsPolicy(path, 'https://evil.example', ALLOW)).toEqual({
        origin: true,
        credentials: false,
      });
    });
  });

  describe('project-scoped MANAGEMENT routes under the same prefix keep the allowlist + credentials', () => {
    // Regression: these used to match a bare /v1/projects/ prefix test and got
    // the delivery policy, which omits Access-Control-Allow-Credentials — the
    // browser then blocks the client's credentialed fetches (project members,
    // invitations, and settings pages broke in prod).
    it.each([
      ['/v1/projects/p1', 'project get/rename/delete'],
      ['/v1/projects/p1/members', 'project members list'],
      ['/v1/projects/p1/members/u2', 'project member update/remove'],
      ['/v1/projects/p1/invitations', 'project invitations'],
      ['/v1/projects/p1/contentfoo', 'lookalike segment is NOT delivery'],
    ])('%s (%s) gets allowlist + credentials', (path) => {
      expect(
        resolveCorsPolicy(path, 'https://wriven.tech', ALLOW),
      ).toEqual({ origin: true, credentials: true });
    });

    it('deny-lists a foreign origin on management routes', () => {
      expect(resolveCorsPolicy('/v1/projects/p1/members', 'https://evil.example', ALLOW)).toEqual(
        { origin: false, credentials: true },
      );
    });
  });

  describe('everything else', () => {
    it('workspace routes get allowlist + credentials', () => {
      expect(
        resolveCorsPolicy('/v1/workspaces/ws1/members', 'https://wriven.tech', ALLOW),
      ).toEqual({ origin: true, credentials: true });
    });

    it('no Origin header (curl, server-to-server) passes untouched', () => {
      expect(resolveCorsPolicy('/v1/projects/p1/members', '', ALLOW)).toEqual({
        origin: true,
        credentials: true,
      });
    });
  });
});
